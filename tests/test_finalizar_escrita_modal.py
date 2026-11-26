# -*- coding: utf-8 -*-
"""
Testes automatizados para validação da abertura do Modal de Finalização Moderno & Resumo do Laudo
ao clicar no botão [ ✨ Finalizar Atendimento ] no Modo Escrita:
<button type="button" id="ia2BtnFinalizarEscrita" class="btn btn-green ia2-btn-finalizar" onclick="finalizarAtendimentoIA2('escrita')">
"""

import os
import re
import pytest

HTML_PATH = os.path.join(os.path.dirname(__file__), "..", "ambiental_avaliacao_medica_lts_cid_assistente.html")
JS_PATH = os.path.join(os.path.dirname(__file__), "..", "ambiental_assistente.js")
CSS_PATH = os.path.join(os.path.dirname(__file__), "..", "ambiental_assistente.css")


def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def test_botao_finalizar_escrita_existe_e_chama_origem_escrita():
    html = read_file(HTML_PATH)
    assert 'id="ia2BtnFinalizarEscrita"' in html
    assert "finalizarAtendimentoIA2('escrita')" in html
    assert "Finalizar Atendimento" in html


def test_modal_finalizacao_moderno_existe_no_html_com_overlay_e_resumo():
    html = read_file(HTML_PATH)
    assert 'id="finalizeOverlay"' in html
    assert "finalize-overlay-premium" in html
    assert 'id="finalizeSummary"' in html
    assert 'id="confirmFinalizeBtn"' in html
    assert "confirmFinalize()" in html


def test_css_modal_finalizacao_moderno():
    css = read_file(CSS_PATH)
    assert "/* ===== MODAL DE FINALIZAÇÃO MODERNO & RESUMO DO LAUDO ===== */" in css
    assert ".finalize-overlay-premium" in css
    assert ".finalize-dialog-modern" in css
    assert ".finalize-overlay-premium.open" in css


from html.parser import HTMLParser


def test_modais_nao_estao_aninhados_dentro_de_finalize_progress_overlay():
    """Garante que #finalizeProgressOverlay está fechado corretamente e nenhum modal fica oculto dentro dele."""
    html = read_file(HTML_PATH)

    class ModalParentParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.stack = []
            self.void_tags = {
                "area", "base", "br", "col", "embed", "hr", "img", "input",
                "link", "meta", "param", "source", "track", "wbr"
            }
            self.modal_ancestors = {}

        def handle_starttag(self, tag, attrs):
            if tag in self.void_tags:
                return
            attr_dict = dict(attrs)
            el_id = attr_dict.get("id", "")
            if el_id in (
                "finalizeOverlay",
                "ia2LoadingOverlay",
                "ia2ModalDecisaoMedico",
                "ia2ModalSucesso",
                "historyModal",
                "diagnosticModal",
            ):
                self.modal_ancestors[el_id] = [item[1] for item in self.stack if item[1]]
            self.stack.append((tag, el_id))

        def handle_endtag(self, tag):
            if tag in self.void_tags:
                return
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    self.stack.pop(i)
                    break

    parser = ModalParentParser()
    parser.feed(html)

    assert len(parser.stack) == 0, f"Tags HTML não fechadas: {parser.stack}"
    for modal_id, ancestors in parser.modal_ancestors.items():
        assert "finalizeProgressOverlay" not in ancestors, (
            f"O modal #{modal_id} está aninhado dentro de #finalizeProgressOverlay (display: none)!"
        )


def test_finalizar_atendimento_escrita_abre_modal_decisao_e_fluxo_ia():
    js = read_file(JS_PATH)
    assert "async function finalizarAtendimentoIA2(origem)" in js
    pattern_escrita = re.search(
        r'abrirModalDecisaoMedicoIA2\("escrita",\s*txtUtil\s*\|\|\s*rawTxt\);',
        js,
    )
    assert pattern_escrita is not None, (
        "finalizarAtendimentoIA2('escrita') deve abrir abrirModalDecisaoMedicoIA2('escrita', ...)"
    )


def test_open_finalize_dialog_abre_finalize_overlay_sem_bloqueio():
    js = read_file(JS_PATH)
    assert "function openFinalizeDialog()" in js
    assert '$("finalizeOverlay")' in js
    assert 'fo.classList.add("open")' in js
    assert 'fo.style.display = "flex"' in js
    assert "autoResolveValidationBlockers" in js


def test_sync_state_contem_limitacao_rol():
    js = read_file(JS_PATH)
    assert "state.limitacaoRol" in js
    assert 'getRadio("limitacaoRol")' in js


def test_preenchimento_completo_result_aceita_null_e_zero_em_parecer_contrario():
    import app as app_module

    raw_gemini_contrario = {
        "nome_paciente": None,
        "cpf_paciente": None,
        "rg_paciente": None,
        "data_nascimento": None,
        "idade": 42,
        "sexo": "Feminino",
        "cargo": "Professor de Educação Básica",
        "doenca_motivo": "Lombalgia leve sem déficit funcional",
        "medications": [{"medicamento": "Dipirona", "dosagem": None, "frequencia": None, "observacao": None}],
        "psicoterapia": None,
        "fisioterapia": "false",
        "cid": "M54.5",
        "cids_secundarios": [None, ""],
        "dias_solicitados": 0,
        "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
        "outros_subtipo": None,
        "outros_resultado": "Normal",
        "exame_mental_resultado": None,
        "exame_fisico_descricao": "Exame físico osteomuscular normal, marcha preservada, Lasègue negativo.",
        "limitacao_funcional": "Não",
        "limitacao_rol": "Não",
        "desc_limitacao": None,
        "atividades_comprometidas": None,
        "capacidade": "Capacidade laborativa preservada",
        "parecer": "CONTRÁRIO",
        "justificativa": None,
    }
    parsed = app_module.PreenchimentoCompletoResult.model_validate(raw_gemini_contrario)
    assert parsed.parecer == "CONTRÁRIO"
    assert parsed.dias_solicitados == "0"
    assert parsed.idade == "42"
    assert parsed.atividades_comprometidas == ""
    assert parsed.psicoterapia is False
    assert parsed.fisioterapia is False


def test_api_preencher_ficha_parecer_contrario_com_nulos_e_fallback(monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    def fake_generate_structured_with_nulls(instruction, schema):
        return schema.model_validate({
            "cid": "M54.5",
            "doenca_motivo": "Lombalgia mecânica sem radiculopatia",
            "dias_solicitados": 0,
            "atividades_comprometidas": None,
            "desc_limitacao": None,
            "justificativa": None,
            "parecer": "CONTRÁRIO",
        })

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_structured_with_nulls)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Paciente refere dor lombar leve, exame físico normal, sem limitação para o trabalho.",
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Normal",
                "diasConcedidos": 0,
                "diasModo": "zero",
                "observacoesMedico": "Exame sem alterações objetivas",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {
                "nomePaciente": "Maria Teste",
                "cargo": "Professor de Educação Básica",
                "cid": "M54.5",
                "diasSolicitados": "5",
            },
        },
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    dados = payload["dados"]
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["limitacao_funcional"] == "Não"
    assert dados["limitacao_rol"] == "Não"
    assert dados["capacidade"] == "Capacidade laborativa preservada"
    assert dados["dias_concedidos"] == "0"
    assert "preservada" in dados["justificativa"].lower()
    assert [q["resposta"] for q in dados["quesitos"]] == ["Sim", "Não", "Não"]

    # Testa também quando _generate_structured lança erro inesperado (acionando fallback determinístico)
    def fake_generate_structured_raises(instruction, schema):
        raise RuntimeError("Falha simulada do modelo ao retornar JSON")

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_structured_raises)
    resp2 = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Periciando avaliado, sem déficit funcional incapacitante. CID M54.5.",
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
                "nomePaciente": "Maria Teste",
                "cargo": "Professor de Educação Básica",
                "cid": "M54.5",
            },
        },
    )
    assert resp2.status_code == 200
    dados2 = resp2.get_json()["dados"]
    assert dados2["parecer"] == "CONTRÁRIO"
    assert dados2["limitacao_funcional"] == "Não"
    assert dados2["limitacao_rol"] == "Não"
    assert dados2["capacidade"] == "Capacidade laborativa preservada"


def test_preenchimento_completo_result_schema_compativel_com_gemini_sem_default():
    """
    A API Gemini rejeita response_schema com 'default' nas propriedades (400 INVALID_ARGUMENT).
    Garante que todas as 48 propriedades são required e nenhuma possui default no schema transformado.
    """
    import app as app_module
    from google.genai._transformers import t_schema

    schema = t_schema(None, app_module.PreenchimentoCompletoResult)
    assert schema.required is not None
    assert len(schema.required) == len(app_module.PreenchimentoCompletoResult.model_fields)
    for prop_name, prop_schema in (schema.properties or {}).items():
        assert prop_schema.default is None, f"Propriedade '{prop_name}' não pode ter default no schema Gemini"
        if prop_schema.items and prop_schema.items.properties:
            for sub_name, sub_schema in prop_schema.items.properties.items():
                assert sub_schema.default is None, (
                    f"Subpropriedade '{prop_name}.{sub_name}' não pode ter default no schema Gemini"
                )


def test_api_preencher_ficha_parecer_contrario_preserva_narrativa_da_ia(monkeypatch):
    """
    Garante que ao selecionar CONTRÁRIO, os textos clínicos individualizados gerados pela IA
    (doenca_motivo, exame_fisico_descricao, desc_limitacao e justificativa) são preservados
    igual ao fluxo FAVORÁVEL, sem serem sobrescritos por textos engessados de auto-preenchimento.
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    ai_exame = (
        "Ao exame físico osteomuscular da coluna lombar, servidora em bom estado geral, "
        "marcha eutrófica sem claudicação, amplitude de movimento lombar preservada, "
        "manobra de Lasègue negativa bilateralmente e força muscular grau V em membros inferiores."
    )
    ai_desc_lim = (
        "Quadro de lombalgia mecânica leve estabilizada com tratamento analgésico, "
        "sem déficit motor ou radiculopatia que configure limitação funcional incapacitante "
        "para as atribuições constantes no Rol de Atividades do cargo de Professor de Educação Básica."
    )
    ai_just = (
        "Constato a capacidade laborativa preservada considerando as atribuições do rol do cargo de "
        "Professor de Educação Básica, uma vez que o quadro de lombalgia mecânica leve, CID M54.5, "
        "apresenta-se compensado ao exame físico pericial atual, com mobilidade preservada e "
        "sem evidência de incapacidade temporária para a regência de classe no período pleiteado."
    )

    def fake_generate_structured_contrario_ia(instruction, schema):
        return schema.model_validate({
            "cid": "M54.5",
            "doenca_motivo": "Lombalgia mecânica leve compensada sem radiculopatia",
            "inicio_tratamento": "há 10 dias",
            "freq_consultas": "mensal",
            "sintomas_limitacao": "Refere desconforto lombar esporádico aos grandes esforços, sem irradiação.",
            "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
            "outros_resultado": "Normal",
            "exame_fisico_descricao": ai_exame,
            "limitacao_funcional": "Não",
            "limitacao_rol": "Não",
            "desc_limitacao": ai_desc_lim,
            "atividades_comprometidas": "",
            "capacidade": "Capacidade laborativa preservada",
            "parecer": "CONTRÁRIO",
            "justificativa": ai_just,
        })

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_structured_contrario_ia)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": (
                "Servidora refere dor lombar leve há 10 dias, sem irradiação. "
                "Ao exame físico: marcha normal, Lasègue negativo, força grau V. CID M54.5."
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
                "nomePaciente": "Maria Teste",
                "cargo": "Professor de Educação Básica",
                "cid": "M54.5",
                "diasSolicitados": "5",
            },
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["doenca_motivo"] == "Lombalgia mecânica leve compensada sem radiculopatia"
    assert dados["exame_fisico_descricao"] == ai_exame
    assert dados["desc_limitacao"] == ai_desc_lim
    assert "lombalgia mecânica leve" in dados["justificativa"].lower()
    assert "regência de classe" in dados["justificativa"].lower()


def test_frontend_nao_sobrescreve_ia_com_aplicar_osteomuscular_normal_no_contrario():
    js = read_file(JS_PATH)
    html = read_file(HTML_PATH)

    start = js.index("function aplicarPreenchimentoIAResultado(")
    end = js.index("function ", start + 40)
    fn_body = js[start:end]

    assert "aplicarOsteomuscularNormal()" not in fn_body, (
        "aplicarPreenchimentoIAResultado não deve chamar aplicarOsteomuscularNormal() quando CONTRÁRIO, "
        "pois isso sobrescreve state.aux com textos estáticos."
    )
    assert "state.aux.exameFisicoDescricao = state.exameFisicoDescricao;" in fn_body
    assert "state.aux.descLimitacao = state.descLimitacao;" in fn_body
    assert "state.aux.justificativa = state.justificativa;" in fn_body

    # Botão de gerar justificativa com IA disponível em todos os tipos de exame no Modo Ágil
    assert 'id="btnAgilJustificativaIA"' in html
    assert 'if (btnIaJust) btnIaJust.style.display = "none";' not in js


def test_modelo_contrario_com_exame_fisico_alterado(monkeypatch):
    """
    Valida o Modelo Sênior: Parecer CONTRÁRIO + Exame Físico Alterado.
    Garante que o resultado do exame permanece 'Alterado', a observação do médico
    é enfatizada, e os campos exame_fisico_descricao, desc_limitacao e justificativa
    reconhecem as alterações clínicas explicando por que não são incapacitantes para o cargo
    (jamais dizendo 'não se observam alterações').
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)
    captured_instructions = []

    def fake_generate_structured_contrario_alterado(instruction, schema):
        captured_instructions.append(instruction)
        # Simula caso em que a IA retornou texto genérico equivocado dizendo "não se observam alterações"
        # para validar também a blindagem determinística sênior do pós-processamento
        return schema.model_validate({
            "cid": "M54.5",
            "doenca_motivo": "lombalgia mecânica crônica leve",
            "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
            "outros_resultado": "Normal",
            "exame_fisico_descricao": "",
            "desc_limitacao": "",
            "justificativa": "Constato a capacidade laborativa preservada, considerando que não se observam alterações.",
            "parecer": "CONTRÁRIO",
        })

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_structured_contrario_alterado)

    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "dor lombar leve, lasegue neg, força grau V, contrat paravertebral discreta. CID M54.5",
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Alterado",
                "diasConcedidos": 0,
                "diasModo": "zero",
                "observacoesMedico": "contratura paravertebral discreta sem déficit motor ou radiculopatia",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {
                "nomePaciente": "João Servidor",
                "cargo": "Professor de Educação Básica II",
                "cid": "M54.5",
                "diasSolicitados": "7",
            },
        },
    )
    assert resp.status_code == 200
    assert len(captured_instructions) == 1
    assert "MODELO ATIVO — PARECER CONTRÁRIO COM EXAME FÍSICO/MENTAL ALTERADO" in captured_instructions[0]
    assert "contratura paravertebral discreta sem déficit motor ou radiculopatia" in captured_instructions[0]

    dados = resp.get_json()["dados"]
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["outros_resultado"] == "Alterado"
    assert dados["limitacao_funcional"] == "Não"
    assert dados["limitacao_rol"] == "Não"
    assert "alterações" in dados["exame_fisico_descricao"].lower()
    assert "contratura paravertebral discreta" in dados["exame_fisico_descricao"].lower()
    assert "embora se observem alterações" in dados["desc_limitacao"].lower()
    assert "não configurando limitação funcional incapacitante" in dados["desc_limitacao"].lower()
    assert "não se observam alterações" not in dados["justificativa"].lower()
    assert "embora o exame clínico pericial atual evidencie alterações" in dados["justificativa"].lower()
    assert "contratura paravertebral discreta" in dados["justificativa"].lower()
    assert "capacidade laborativa preservada" in dados["justificativa"].lower()


def test_modelos_favoravel_retrospectivo_reducao_dias_e_contrario_documental(monkeypatch):
    """
    Valida os modelos:
    - FAVORÁVEL + Exame Normal (Retrospectivo / Convalescença) + Redução de Dias + Observações do Médico
    - CONTRÁRIO + Exame Documental
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    def fake_generate_empty(instruction, schema):
        return schema.model_validate({
            "cid": "M54.4",
            "doenca_motivo": "lumbago com ciática",
            "dias_solicitados": "15",
        })

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_empty)
    client = app_module.app.test_client()

    # 1. FAVORÁVEL + Normal (Retrospectivo) + Redução para 10 dias
    resp_fav_norm = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Crise de lombociatalgia há 8 dias, hoje melhor após medicação. Atestado de 15 dias.",
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "decisao_medico": {
                "parecer": "FAVORÁVEL",
                "exameFisicoResultado": "Normal",
                "diasConcedidos": 10,
                "diasModo": "reduzir",
                "observacoesMedico": "remissão da dor aguda após ciclo de corticoterapia",
                "retroacaoInvalida": False,
                "parecerManualOverride": "FAVORÁVEL",
            },
            "contexto_atual": {
                "nomePaciente": "Ana Servidora",
                "cargo": "Agente de Organização Escolar",
                "cid": "M54.4",
            },
        },
    )
    assert resp_fav_norm.status_code == 200
    d1 = resp_fav_norm.get_json()["dados"]
    assert d1["parecer"] == "FAVORÁVEL"
    assert d1["outros_resultado"] == "Normal"
    assert d1["dias_solicitados"] == "10"
    assert d1["dias_concedidos"] == "10"
    assert "convalescença" in d1["justificativa"].lower()
    assert "10 dias" in d1["justificativa"].lower()
    assert "remissão da dor aguda" in d1["justificativa"].lower()

    # 2. CONTRÁRIO + Documental
    resp_contr_doc = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Avaliação documental de lombalgia, sem elementos de incapacidade aguda. CID M54.4",
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "decisao_medico": {
                "parecer": "CONTRÁRIO",
                "exameFisicoResultado": "Documental",
                "diasConcedidos": 0,
                "diasModo": "zero",
                "observacoesMedico": "documentação apresentada sem evidência de crise incapacitante",
                "retroacaoInvalida": False,
                "parecerManualOverride": "CONTRÁRIO",
            },
            "contexto_atual": {
                "nomePaciente": "Ana Servidora",
                "cargo": "Agente de Organização Escolar",
                "cid": "M54.4",
            },
        },
    )
    assert resp_contr_doc.status_code == 200
    d2 = resp_contr_doc.get_json()["dados"]
    assert d2["parecer"] == "CONTRÁRIO"
    assert "documental" in d2["desc_limitacao"].lower()
    assert "documental" in d2["justificativa"].lower()
    assert "documentação apresentada sem evidência de crise incapacitante" in d2["justificativa"].lower()


def test_retroacao_invalida_gera_justificativa_resumida_mantendo_limitacoes(monkeypatch):
    """
    Garante que ao identificar retroação inválida (> 3 dias), a IA mantém as limitações
    (limitacao_funcional='Sim', limitacao_rol='Sim', quesitos Sim/Sim/Sim) e gera um
    texto RESUMIDO e direto no parecer/justificativa, sem parênteses ().
    """
    import app as app_module

    monkeypatch.setattr(app_module, "AUTH_REQUIRED", False)

    def fake_generate_retro(instruction, schema):
        return schema.model_validate({
            "cid": "M54.4",
            "doenca_motivo": "lumbago com ciática aguda à direita",
            "sintomas_limitacao": "Refere dor lombar intensa irradiada para membro inferior direito com limitação para ortostatismo.",
            "data_documento": "2026-01-10",
            "data_expedicao": "2026-01-20",
            "dias_solicitados": "15",
            "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
            "outros_resultado": "Alterado",
        })

    monkeypatch.setattr(app_module, "_generate_structured", fake_generate_retro)
    client = app_module.app.test_client()
    resp = client.post(
        "/api/ai/preencher-ficha",
        json={
            "texto_bruto": "Atestado de 15 dias emitido em 10/01/2026, guia expedida em 20/01/2026. Lombociatalgia aguda CID M54.4.",
            "modo_ia2": True,
            "origem_modo_ia2": "escrita",
            "contexto_atual": {
                "nomePaciente": "Carlos Servidor",
                "cargo": "Professor de Educação Básica",
            },
        },
    )
    assert resp.status_code == 200
    dados = resp.get_json()["dados"]
    assert dados["parecer"] == "CONTRÁRIO"
    assert dados["limitacao_funcional"] == "Sim"
    assert dados["limitacao_rol"] == "Sim"
    assert [q["resposta"] for q in dados["quesitos"]] == ["Sim", "Sim", "Sim"]

    just = dados["justificativa"]
    assert "(" not in just and ")" not in just
    assert "limitações temporárias" in just.lower()
    assert "10 dias de retroação" in just.lower()
    assert "CONTRÁRIO" in just
    assert len(just) < 350, f"Texto de retroação deve ser resumido e conciso (< 350 chars), mas teve {len(just)}: {just}"




