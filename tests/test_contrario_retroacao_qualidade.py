import os
import re


ROOT = os.path.dirname(os.path.dirname(__file__))
JS_PATH = os.path.join(ROOT, "ambiental_assistente.js")


def _read_js():
    with open(JS_PATH, "r", encoding="utf-8") as fh:
        return fh.read()


def test_generate_structured_continues_across_fallback_models_on_errors(monkeypatch):
    """
    Garante que uma falha em modelos iniciais (ex.: 404/ClientError ou 503/ServerError)
    não interrompa prematuramente a cadeia GEMINI_FALLBACK_MODELS.
    """
    import app as app_module

    class FakeResponse:
        def __init__(self, text):
            self.text = text

    class FakeModels:
        def __init__(self):
            self.calls = []

        def generate_content(self, model, contents, config):
            self.calls.append(model)
            if model == "modelo-a":
                raise RuntimeError("404 NOT_FOUND: model not supported")
            if model == "modelo-b":
                raise RuntimeError("503 UNAVAILABLE: high demand")
            return FakeResponse('{"parecer": "CONTRÁRIO", "cid": "M54.5"}')

    fake_models = FakeModels()

    class FakeClient:
        models = fake_models

    logged = []
    monkeypatch.setattr(app_module, "_client", lambda: FakeClient())
    monkeypatch.setattr(app_module, "_rate_limit", lambda ep: (True, 0))
    monkeypatch.setattr(app_module, "GEMINI_MODEL", "modelo-a")
    monkeypatch.setattr(app_module, "GEMINI_FALLBACK_MODELS", ["modelo-b", "modelo-c"])
    monkeypatch.setattr(app_module, "GEMINI_RETRIES", 1)
    monkeypatch.setattr(app_module, "_MODEL_COOLDOWN_UNTIL", {})
    monkeypatch.setattr(
        app_module,
        "_log_ai",
        lambda ep, model, dur, status, err=None, atd=None: logged.append((model, status, err)),
    )

    with app_module.app.test_request_context("/api/ai/preencher-ficha", method="POST", json={}):
        res = app_module._generate_structured("Teste", app_module.PreenchimentoCompletoResult)

    assert fake_models.calls == ["modelo-a", "modelo-b", "modelo-c"]
    assert res.parecer == "CONTRÁRIO"
    assert res.cid == "M54.5"
    assert ("modelo-a", "ERRO", "RuntimeError") in logged
    assert ("modelo-b", "ERRO", "RuntimeError") in logged
    assert ("modelo-c", "SUCESSO", None) in logged


def test_retroacao_invalida_oncologica_feminina_fallback_deterministico(monkeypatch):
    """
    Simula caso real de retroação > 3 dias com patologia oncológica feminina (CID C53.0)
    quando há falha de todos os modelos Gemini (fallback determinístico):
    - Mantém parecer CONTRÁRIO por retroação com limitações Sim/Sim e atividades_comprometidas
    - Refina 'Endocervix' em neoplasia maligna do endocérvice
    - Não gera 'Nega ... neoplasias' contraditório
    - Aplica concordância feminina e semiologia clínica robusta.
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    def fake_fail(instruction, schema):
        raise RuntimeError("503 UNAVAILABLE simulated failure")

    monkeypatch.setattr(app_module, "_generate_structured", fake_fail)
    client = app_module.app.test_client()

    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": (
                "Servidora Audria em seguimento oncológico de carcinoma do endocérvice, CID C53.0. "
                "Atestado de 15 dias emitido em 05/11/2026; guia expedida em 12/11/2026. "
                "Nega antecedentes prévios."
            ),
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "contexto_atual": {
                "nomePaciente": "AUDRIA TESTE",
                "cargo": "Professor de Educação Básica II",
                "doencaMotivo": "Endocervix",
                "cid": "C53.0",
                "diasSolicitados": "15",
            },
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["retroacao_invalida"] is True
    assert dados["limitacao_funcional"] == "Sim"
    assert dados["limitacao_rol"] == "Sim"
    assert dados["capacidade"] == "Capacidade parcial e temporariamente prejudicada"
    assert dados["atividades_comprometidas"]
    assert dados["sexo"] == "Feminino"

    assert "neoplasia" in dados["doenca_motivo"].lower()
    assert "neoplasia" not in re.sub(r".*?(nega[^.]*)", r"\1", dados["historico_pregresso"].lower())

    ef = dados["exame_fisico_descricao"].lower()
    assert len(ef) >= 120
    assert "periciada" in ef
    assert "periciado" not in ef
    assert "lúcida e orientada" in ef

    just = dados["justificativa"]
    assert "(" not in just and ")" not in just
    assert "limitações temporárias" in just.lower()


def test_gestante_com_acompanhamento_medico_nao_dispara_z76_acompanhante(monkeypatch):
    """
    Garante que 'acompanhamento médico / pré-natal' em gestante (CID Z35.8) nunca seja
    classificado erroneamente como perícia de acompanhante (CID Z76.3 / Artigo 199).
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    def fake_fail(instruction, schema):
        raise RuntimeError("503 UNAVAILABLE simulated failure")

    monkeypatch.setattr(app_module, "_generate_structured", fake_fail)
    client = app_module.app.test_client()

    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": (
                "Servidora Iris, gestante de alto risco em acompanhamento médico pré-natal. "
                "CID Z35.8. Atestado de 5 dias."
            ),
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Normal",
                "diasConcedidos": 0,
                "diasModo": "zero",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {
                "nomePaciente": "IRIS SERVIDORA",
                "cargo": "Professor de Educação Básica I",
                "cid": "Z35.8",
                "doencaMotivo": "Supervisão de gravidez de alto risco com acompanhamento médico",
            },
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["is_acompanhante"] is False
    assert dados["tipo_atendimento_pericia"] == "SERVIDOR"
    assert dados["cid"] == "Z35.8"
    combined = " ".join([
        dados.get("sintomas_limitacao", ""),
        dados.get("exame_fisico_descricao", ""),
        dados.get("desc_limitacao", ""),
        dados.get("justificativa", ""),
    ]).lower()
    assert "artigo 199" not in combined
    assert "familiar enfermo" not in combined
    assert "pessoa doente" not in combined


def test_modelos_contrarios_fallback_deterministico_mantem_semiologia_rica(monkeypatch):
    """
    Valida que, mesmo quando o modelo Gemini falha e entra no fallback determinístico,
    os modelos CONTRÁRIO (Mental Normal, Osteo Alterado, Documental) mantêm semiologia rica,
    concordância de gênero e preenchimento completo equivalente ao FAVORÁVEL.
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)
    monkeypatch.setattr(app_module, "_generate_structured", lambda inst, schema: (_ for _ in ()).throw(RuntimeError("503")))
    client = app_module.app.test_client()

    # 1. CONTRÁRIO + Mental Normal
    r_mental = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Servidora Maria, CID F33.2, sem crise aguda no ato pericial.",
            "modo_ia2": True,
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Normal",
                "diasConcedidos": 0,
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {"nomePaciente": "MARIA TESTE", "cargo": "Diretor de Escola", "cid": "F33.2"},
        },
    )
    assert r_mental.status_code == 200
    dm = r_mental.get_json()["dados"]
    assert dm["parecer"] == "CONTRÁRIO"
    assert dm["exame_fisico_tipo"] == "Exame Mental"
    assert dm["outros_resultado"] == "Normal"
    assert "exame psíquico" in dm["exame_fisico_descricao"].lower()
    assert "juízo crítico" in dm["exame_fisico_descricao"].lower()
    assert "a periciada" in dm["exame_fisico_descricao"].lower()
    assert dm["sintomas_limitacao"]
    assert dm["historico_pregresso"]

    # 2. CONTRÁRIO + Osteo Alterado com observação do médico
    r_osteo = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Servidor Carlos refere lombalgia leve crônica. CID M54.5.",
            "modo_ia2": True,
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Alterado",
                "diasConcedidos": 0,
                "observacoesMedico": "contratura lombar discreta sem déficit radicular",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {"nomePaciente": "CARLOS TESTE", "sexo": "Masculino", "cargo": "Auxiliar de Serviços Gerais", "cid": "M54.5"},
        },
    )
    assert r_osteo.status_code == 200
    do = r_osteo.get_json()["dados"]
    assert do["parecer"] == "CONTRÁRIO"
    assert do["limitacao_funcional"] == "Não"
    assert do["outros_resultado"] == "Alterado"
    assert "alterações" in do["exame_fisico_descricao"].lower()
    assert "contratura lombar discreta" in do["exame_fisico_descricao"].lower()
    assert "embora se observem alterações" in do["desc_limitacao"].lower()
    assert "capacidade laborativa preservada" in do["justificativa"].lower()

    # 3. CONTRÁRIO + Documental
    r_doc = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Avaliação documental de hérnia umbilical sem sinais de complicação aguda. CID K42.9.",
            "modo_ia2": True,
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Documental",
                "diasConcedidos": 0,
                "observacoesMedico": "ultrassom sem sinais de encarceramento",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {"nomePaciente": "JOAO DOCUMENTAL", "sexo": "Masculino", "cargo": "Professor", "cid": "K42.9"},
        },
    )
    assert r_doc.status_code == 200
    dd = r_doc.get_json()["dados"]
    assert dd["parecer"] == "CONTRÁRIO"
    assert "document" in dd["exame_fisico_descricao"].lower()
    assert "ultrassom sem sinais de encarceramento" in dd["exame_fisico_descricao"].lower()
    assert "documental" in dd["justificativa"].lower()


def test_frontend_ia2_contrario_e_guards_estruturais():
    """
    Valida contratos estruturais no ambiental_assistente.js:
    - finalizarAtendimentoIA2 não polui state.queixaDuracao / ensureAgileBackgroundDefaults antes da IA
    - aplicarPreenchimentoIAResultado marca _ia2Estruturado e regenera queixaDuracao
    - Helpers compartilhados isAcompanhanteContext e inferIsFemininoJS substituem /acompanha/ ingênuo
    - ensureAgileBackgroundDefaults protege descLimitacao e parecer CONTRÁRIO + Alterado.
    """
    js = _read_js()

    s_fin = js.index("function finalizarAtendimentoIA2(")
    e_fin = js.index("\nfunction ", s_fin + 30)
    fin_body = js[s_fin:e_fin]
    assert "ensureAgileBackgroundDefaults()" not in fin_body
    assert "_ia2ModoPendente = true" in fin_body

    s_app = js.index("function aplicarPreenchimentoIAResultado(")
    e_app = js.index("\nwindow.executarPreenchimentoIA", s_app + 40)
    app_body = js[s_app:e_app]
    assert "_ia2Estruturado = true" in app_body
    assert "gerarNarrativaQueixaMelhoriaContinua" in app_body

    assert "function isAcompanhanteContext(" in js
    assert "function inferIsFemininoJS(" in js
    assert "window.isAcompanhanteContext = isAcompanhanteContext" in js
    assert "window.inferIsFemininoJS = inferIsFemininoJS" in js

    for fn_name in (
        "function gerarNarrativaLimitacoesMelhoriaContinua(",
        "function gerarNarrativaJustificativaMelhoriaContinua(",
        "function ensureAgileBackgroundDefaults(",
    ):
        idx = js.index(fn_name)
        nxt = js.index("\nfunction ", idx + len(fn_name))
        body = js[idx:nxt]
        assert "isAcompanhanteContext(" in body
        assert "/acompanha/i.test" not in body

    idx_ens = js.index("function ensureAgileBackgroundDefaults(")
    nxt_ens = js.index("\nfunction ", idx_ens + 40)
    ens_body = js[idx_ens:nxt_ens]
    assert "!state.aux._ia2Estruturado || !state.descLimitacao" in ens_body
    assert "!isExplicitContrary && state.exameMentalResultado === \"Alterado\"" in ens_body
    assert "!isExplicitContrary && hasAlterado" in ens_body
    assert "!isExplicitContrary && (state.outrosResultado === \"Alterado\"" in ens_body

    idx_ant = js.index("function gerarNarrativaAntecedentesMelhoriaContinua(")
    nxt_ant = js.index("\nfunction ", idx_ant + 40)
    ant_body = js[idx_ant:nxt_ant]
    assert "temCidOnco" in ant_body


def test_iris_z358_acompanhamento_medico_nao_dispara_artigos_191_193():
    """
    Garante que CID/motivo clínico contendo 'acompanhamento médico especializado' (ex.: Z35.8)
    não dispare falsamente justificativa de acompanhante de familiar/dependente enfermo
    (Artigos 191 e 193) nem no construtor determinístico nem no gatekeeper e-SISLA.
    """
    import app as app_module

    payload = {
        "nome": "ÍRIS TESTE",
        "idade": "34",
        "sexo": "Feminino",
        "cargo": "Assistente Social",
        "readaptado": "Não",
        "cid": "Z35.8",
        "doenca_motivo": "Supervisão de gravidez de alto risco em acompanhamento médico especializado",
        "parecer": "CONTRÁRIO",
        "data_documento": "2026-11-10",
        "data_expedicao_guia": "2026-11-11",
        "exame_fisico_tipo": "Aparelho Circulatório",
        "exame_fisico_descricao": "murmurío vesicular audível; bulias rítmicas normofonéticas.",
        "alteracoes_clinicas_exames": "Sem sinais de descompensação aguda.",
    }
    doc = app_module._build_deterministic_esisla(payload)
    doc = app_module._gatekeeper_anti_glosa_esisla(doc, payload)

    low = doc.lower()
    assert "artigos 191 e 193" not in low
    assert "dependente enfermo" not in low
    assert "acompanhamento de dependente" not in low
    assert "capacidade laborativa própria preservada" in low
    assert "assistente social" in low
    assert "murmúrio vesicular" in low
    assert "bulhas rítmicas" in low
    assert re.search(r"1\)\s*Há doença.*?Sim", doc, re.IGNORECASE)
    assert re.search(r"2\)\s*A\(s\) doença.*?Não", doc, re.IGNORECASE)
    assert re.search(r"3\)\s*A\(s\) limitação.*?Não", doc, re.IGNORECASE)


def test_audria_retroacao_cargo_travessao_limitacoes_e_semiologia():
    """
    Garante para casos de retroação > 3 dias com cargo vazio/'—' (ex.: AUDRIA C53.0):
    - 'cargo de —' seja normalizado para 'cargo de servidor'
    - Limitações Físicas e Mentais não contenham CID entre parênteses nem cláusula administrativa de retroação
    - Erros de semiologia ('murmur vésicular', 'com rítmico bulhas normofonéticas', 'fácies de cansada') sejam corrigidos
    """
    import app as app_module

    payload = {
        "nome": "AUDRIA TESTE",
        "idade": "46",
        "sexo": "Feminino",
        "cargo": "—",
        "readaptado": "Não",
        "cid": "C53.0",
        "doenca_motivo": "neoplasia maligna do endocérvice em tratamento antineoplásico com quimioterapia",
        "parecer": "CONTRÁRIO",
        "retroacaoInvalida": True,
        "retroacaoDias": 7,
        "data_documento": "2026-11-05",
        "data_expedicao_guia": "2026-11-12",
        "exame_fisico_tipo": "Aparelho Circulatório",
        "exame_fisico_descricao": (
            "Servidora com fácies de cansada, murmur vésicular universalmente audível, "
            "com rítmico bulhas normofonéticas."
        ),
        "desc_limitacao": (
            "Apresentou relato de limitações funcionais decorrentes do quadro clínico pleiteado "
            "(C53.0 — Neoplasia maligna do endocérvice), tais como astenia intensa e fadiga. "
            "Todavia, em razão da emissão extemporânea da guia pericial com mais de 3 dias de retroação "
            "em relação ao atestado médico sem comprovação de internamento hospitalar, a concessão resta obstada."
        ),
    }

    doc = app_module._build_deterministic_esisla(payload)
    # Também simula texto já contaminado vindo do modelo LLM antes do gatekeeper
    contaminated = doc.replace("cargo de servidor", "cargo de —")
    out = app_module._gatekeeper_anti_glosa_esisla(contaminated, payload)

    assert "cargo de —" not in out
    assert "cargo de servidor" in out.lower()
    assert "murmúrio vesicular" in out.lower()
    assert "ritmo cardíaco regular e bulhas normofonéticas" in out.lower()
    assert "fácies cansada" in out.lower()
    assert "fácies de cansada" not in out.lower()

    m_lim = re.search(
        r"\(\*\)\s*Descri[çc][ãa]o\s*da\(s\)\s*Limita[çc][ãa]o[^\n\r]*\n(.*?)\n\s*\(\*\)\s*Parecer\s*M[ée]dico",
        out,
        flags=re.DOTALL | re.IGNORECASE,
    )
    assert m_lim is not None
    lim_txt = m_lim.group(1)
    assert "todavia, em razão da emissão extemporânea" not in lim_txt.lower()
    assert "(c53.0" not in lim_txt.lower()


def test_frontend_gestao_quesitos_e_assistente_regressions():
    """
    Valida contratos de regressão no gestao_atendimentos.js e ambiental_assistente.js:
    - getQuesitoVal usa rxLine direta sem depender de ':' em ext() e protege Q1=Sim com CID
    - isAcompCard no Gestão não dispara falso positivo para 'acompanhamento médico'
    - sanitizePtBrEsisla corrige semiologia e 'cargo de —'
    - newEmptyState limpa flags de retroação/parecerManualOverride entre atendimentos
    - gerarNarrativaQueixaMelhoriaContinua evita duplicar 'Não relatou troca de medicação...'
    - normalizeCargoLabelJS impede travessão '—' em justificativas no frontend
    """
    gestao_path = os.path.join(ROOT, "gestao_atendimentos.js")
    with open(gestao_path, "r", encoding="utf-8") as fh:
        gestao = fh.read()
    js = _read_js()

    assert gestao.count("const rxLine = new RegExp") >= 2
    assert "const isAcompCard =" in gestao
    assert "murmúrio vesicular" in gestao
    assert "ritmo cardíaco regular e bulhas normofonéticas" in gestao
    assert r"cargo\s+de\s*[—–\-]+" in gestao

    assert "function normalizeCargoLabelJS(" in js
    idx_empty = js.index("function newEmptyState(")
    nxt_empty = js.index("\nfunction ", idx_empty + 20)
    empty_body = js[idx_empty:nxt_empty]
    assert 'state.parecerManualOverride = ""' in empty_body
    assert "state.retroacaoInvalida = false" in empty_body
    assert "state.retroacaoDias = null" in empty_body

    idx_qx = js.index("function gerarNarrativaQueixaMelhoriaContinua(")
    nxt_qx = js.index("\nfunction ", idx_qx + 20)
    qx_body = js[idx_qx:nxt_qx]
    assert "temNegacaoTroca" in qx_body

