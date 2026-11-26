import re
from pathlib import Path
from unittest.mock import patch

import pytest

import app as app_module


def _base_payload(**overrides):
    p = {
        "atendimento": "999000101",
        "nome_paciente": "Maria Aparecida da Silva",
        "sexo": "Feminino",
        "idade": "44",
        "cargo": "PROFESSOR DE EDUCACAO BASICA II",
        "tempo_funcao": "12",
        "unidade_tempo": "anos",
        "readaptado": "Não",
        "atividades_readaptado": "",
        "cid": "M54.5",
        "doenca_motivo": "Lombalgia aguda com irradiação para membro inferior direito",
        "inicio_tratamento": "2026",
        "frequencia_consultas": "mensal",
        "sintomas_limitacoes": "Dor lombar intensa com piora ao permanecer em pé e dificuldade para deambulação prolongada.",
        "medications": [
            {"medicamento": "Dipirona", "dosagem": "1 g", "frequencia": "6/6h se dor"},
            {"medicamento": "Ciclobenzaprina", "dosagem": "5 mg", "frequencia": "à noite"},
        ],
        "fisioterapia": "Sim",
        "psicoterapia": "Não",
        "historico_pregresso": "",
        "exame_fisico_tipo": "Aparelho Osteomuscular e Tecido Conjutivo",
        "exame_fisico_descricao": "",
        "alteracoes_clinicas_exames": "",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "15",
        "data_documento": "2026-10-10",
        "data_atendimento": "2026-10-12",
        "hora_atendimento": "14:30",
        "medico": "Dr. FRANCIMARA DE SOUZA - CRM 123456",
        "crm_responsavel": "123456",
        "pressao_sistolica": "12",
        "pressao_diastolica": "8",
        "pulso": "76",
        "altura": "165",
        "peso": "68",
    }
    p.update(overrides)
    return p


class TestHelpersAntiGlosaDPME:
    def test_titulo_medico_perito_dra_vs_dr(self):
        assert app_module._formatar_titulo_medico_perito("Dr. Francimara de Souza - CRM 12345") == "Dra. Francimara de Souza"
        assert app_module._formatar_titulo_medico_perito("DR. WANIA MARIA SILVA") == "Dra. Wania Maria Silva"
        assert app_module._formatar_titulo_medico_perito("Beatriz Costa") == "Dra. Beatriz Costa"
        assert app_module._formatar_titulo_medico_perito("Raquel Mendes - 98765") == "Dra. Raquel Mendes"
        assert app_module._formatar_titulo_medico_perito("simone.alves@clinica.sp.gov.br") == "Dra. Simone Alves"
        assert app_module._formatar_titulo_medico_perito("Carlos Eduardo Pereira - CRM 54321") == "Dr. Carlos Eduardo Pereira"
        assert app_module._formatar_titulo_medico_perito("Dr. Luca Oliveira") == "Dr. Luca Oliveira"
        assert app_module._formatar_titulo_medico_perito("Djalma Santos") == "Dr. Djalma Santos"
        assert app_module._formatar_titulo_medico_perito("-") == ""
        assert app_module._formatar_titulo_medico_perito("") == ""

    def test_descricao_concisa_cid_parecer(self):
        longo = (
            "Abscesso cutâneo em região glútea esquerda com início dos sintomas em 02/10/2026 "
            "caracterizado por dor intensa, hiperemia local, drenagem cirúrgica e febre persistente "
            "necessitando de acompanhamento ambulatorial contínuo e uso de antibióticos"
        )
        res = app_module._descricao_concisa_cid_parecer("L02.3", longo)
        assert len(res) <= 95
        assert "02/10/2026" not in res
        assert res[0].isupper()

        curto = app_module._descricao_concisa_cid_parecer("M54.5", "Vem com atestado de 10 dias por lombalgia aguda em 05/10/2026.")
        assert curto == "Lombalgia aguda"

    def test_validar_exames_complementares_filtra_nao_exames(self):
        fallback = "Não foram apresentados exames complementares (imagem ou laboratoriais) no ato pericial."
        assert app_module._validar_e_limpar_exames_complementares("Hiperemia de orofaringe e dor abdominal difusa.") == fallback
        assert app_module._validar_e_limpar_exames_complementares("Alterações psíquicas compatíveis com ansiedade grave.") == fallback
        exame_real = "Ressonância Magnética de coluna lombar (15/08/2026): protrusão discal L4-L5."
        assert app_module._validar_e_limpar_exames_complementares(exame_real) == exame_real
        assert app_module._validar_e_limpar_exames_complementares(exame_real, ef_text=exame_real) == fallback

    def test_clean_justificativa_primeira_pessoa_sem_parenteses_sem_dias(self):
        bruta = (
            "Fundamenta-se a incapacidade laborativa temporária (CID M54.5) "
            "pelo período concedido de 15 dias para recuperação clínica. "
            "Concedo 15 dias de afastamento a contar da data de início dos sintomas."
        )
        limpa = app_module._clean_justificativa_text(bruta)
        assert limpa.startswith("Considero ")
        assert "(" not in limpa and ")" not in limpa
        assert "15 dias" not in limpa

        retro = "Embora o periciado apresente quadro compatível, constata-se que a guia pericial foi expedida com mais de 3 dias de retroação."
        limpa_retro = app_module._clean_justificativa_text(retro)
        assert "mais de 3 dias de retroação" in limpa_retro
        assert "constato que a guia pericial" in limpa_retro.lower()

    def test_anexar_rol_sem_duplicar_cargo(self):
        txt = "Limitação para regência de classe no cargo de Professor de Educação Básica II."
        res = app_module._anexar_rol_sem_duplicar_cargo(txt, "Professor de Educação Básica II")
        assert res.lower().count("professor de educação básica ii") == 1
        assert "respectivo Rol de Atividades" in res


class TestModoSemIADeterministicoAuditoria:
    @pytest.mark.parametrize(
        "caso,overrides",
        [
            ("ortopedico_sem_ef_e_just", {}),
            (
                "mental_readaptada_tempo_zero_topico_decimal",
                {
                    "cid": "F32.1",
                    "doenca_motivo": "Episódio depressivo moderado",
                    "tempo_funcao": "0",
                    "readaptado": "Sim",
                    "atividades_readaptado": "Atividades administrativas de apoio escolar",
                    "exame_fisico_tipo": "Exame Mental",
                    "medications": [
                        {"medicamento": "Clonazepam", "dosagem": "0.5 mg", "frequencia": "à noite"},
                        {"medicamento": "Nebacetin", "dosagem": "uso tópico", "frequencia": ""},
                        {"medicamento": "Sintomáticos", "dosagem": "conforme prescrição", "frequencia": ""},
                    ],
                },
            ),
            (
                "posop_complicacao_t81_4",
                {
                    "cid": "T81.4",
                    "doenca_motivo": "Infecção de sítio cirúrgico pós-procedimento cirúrgico abdominal",
                    "historico_pregresso": "Nega antecedentes mórbidos relevantes, exceto pelo procedimento cirúrgico recente.",
                    "exame_fisico_tipo": "Outros",
                    "outros_subtipo": "Pele e Fâneros",
                },
            ),
            (
                "oncologia_c50",
                {
                    "cid": "C50.9",
                    "doenca_motivo": "Neoplasia maligna de mama em quimioterapia adjuvante",
                    "sintomas_limitacoes": "Fadiga intensa e náuseas após ciclos de quimioterapia.",
                    "medications": [],
                },
            ),
            (
                "respiratorio_com_cid_secundario_u07",
                {
                    "cid": "J06.9",
                    "doenca_motivo": "Infecção aguda das vias aéreas superiores",
                    "cids_secundarios": [{"cid": "U07.1", "descricao": ""}],
                    "alteracoes_clinicas_exames": "Hiperemia de orofaringe e dor abdominal difusa.",
                    "exame_fisico_tipo": "Outros",
                    "outros_subtipo": "Aparelho Respiratório",
                },
            ),
            (
                "dermatologia_l02",
                {
                    "cid": "L02.9",
                    "doenca_motivo": "Abscesso cutâneo em região dorsal submetido a drenagem cirúrgica em 08/10/2026 com evolução dolorosa local e necessidade de curativos diários",
                    "exame_fisico_tipo": "Outros",
                    "outros_subtipo": "Pele e Fâneros",
                },
            ),
            (
                "contrario_preservada",
                {
                    "sexo": "Masculino",
                    "nome_paciente": "João Carlos Mendes",
                    "parecer": "CONTRÁRIO",
                    "dias_solicitados": "10",
                    "medico": "Carlos Henrique Silva - CRM 99887",
                },
            ),
            (
                "contrario_readaptado",
                {
                    "sexo": "Masculino",
                    "nome_paciente": "Roberto Alves",
                    "parecer": "CONTRÁRIO",
                    "readaptado": "Sim",
                    "atividades_readaptado": "Apoio administrativo leve",
                    "dias_solicitados": "10",
                },
            ),
            (
                "contrario_retroacao_maior_3_dias",
                {
                    "parecer": "CONTRÁRIO",
                    "data_documento": "2026-10-01",
                    "data_expedicao_guia": "2026-10-10",
                    "dias_solicitados": "7",
                },
            ),
            (
                "acompanhante_z76_favoravel",
                {
                    "cid": "Z76.3",
                    "is_acompanhante": True,
                    "pessoa": "filha menor de idade",
                    "doenca_motivo": "Acompanhamento de filha menor internada",
                    "medications": [],
                    "parecer": "FAVORÁVEL",
                    "dias_solicitados": "5",
                },
            ),
        ],
    )
    def test_deterministico_passa_auditoria_dpme_com_excelencia(self, caso, overrides):
        raw = _base_payload(**overrides)
        payload = app_module._minimal_ai_context(raw)
        ficha = app_module._build_deterministic_esisla(payload)
        ficha = app_module._gatekeeper_anti_glosa_esisla(ficha, payload)

        audit = app_module.auditar_ficha_esisla(ficha, payload)
        assert audit["criticos"] == [], f"Caso {caso} teve alertas críticos: {audit['criticos']}\n{ficha}"
        assert audit["score"] >= 95, f"Caso {caso} teve score baixo ({audit['score']}): {audit['alertas']}\n{ficha}"
        assert audit["status"] == "APROVADO"

        # Verificações específicas por caso
        if caso == "ortopedico_sem_ef_e_just":
            assert "Médico Perito: Dra. Francimara de Souza" in ficha
            assert "Sistólica (mmHg): 120" in ficha
            assert "Altura: 1.65" in ficha
            assert "Considero " in ficha
        elif caso == "mental_readaptada_tempo_zero_topico_decimal":
            assert "há 0 anos" not in ficha.lower()
            assert "atividades de atividades" not in ficha.lower()
            assert "0,5 mg" in ficha
            assert "0.5 mg" not in ficha
            assert "Em uso de Sintomáticos" not in ficha
            assert not re.search(r"Nebacetin[^.\n]*n[ãa]o\s+informad[oa]\s+sua\s+dosagem", ficha, re.I)
        elif caso == "posop_complicacao_t81_4":
            m_ant = re.search(r"Antecedentes Mórbidos:\n(.*?)\n\nAtestado", ficha, re.S)
            assert m_ant and "cirurgias prévias" not in m_ant.group(1).lower()
        elif caso == "oncologia_c50":
            m_ant = re.search(r"Antecedentes Mórbidos:\n(.*?)\n\nAtestado", ficha, re.S)
            assert m_ant and "neoplasias" not in m_ant.group(1).lower()
            assert "Negou uso de medicações" not in ficha
        elif caso == "respiratorio_com_cid_secundario_u07":
            assert "CID 10 Secundário: U07.1" in ficha
            assert re.search(r"Descrição Secundária:\s+\S+", ficha)
            assert "Hiperemia de orofaringe" not in ficha
            assert "Não foram apresentados exames complementares" in ficha
        elif caso == "dermatologia_l02":
            m_desc = re.search(r"^Descrição:\s*(.+)$", ficha, re.M)
            assert m_desc and len(m_desc.group(1).strip()) <= 95
            assert "08/10/2026" not in m_desc.group(1)
        elif caso == "contrario_preservada":
            assert "Médico Perito: Dr. Carlos Henrique Silva" in ficha
            assert "Nº Dias: 0" in ficha
            assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in ficha
        elif caso == "contrario_retroacao_maior_3_dias":
            assert "Nº Dias: 0" in ficha
            assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in ficha
            assert "retroação" in ficha.lower()

    def test_orcamento_caracteres_trunca_limpamente(self):
        payload = app_module._minimal_ai_context(_base_payload())
        ficha = app_module._build_deterministic_esisla(payload)
        frase = "Refere dor lombar irradiada com piora funcional importante durante a jornada laboral. "
        queixa_gigante = frase * 32  # > 2600 chars
        ficha_estourada = re.sub(
            r"(\(\*\)\s*Queixa e Duração:\n)(.*?)(\n\nAntecedentes Mórbidos:)",
            lambda m: m.group(1) + queixa_gigante + m.group(3),
            ficha,
            flags=re.S,
        )
        ficha_blindada = app_module._gatekeeper_anti_glosa_esisla(ficha_estourada, payload)
        audit = app_module.auditar_ficha_esisla(ficha_blindada, payload)
        assert audit["metricas_campos"]["queixa"] <= 2000
        assert audit["criticos"] == []


class TestEndpointsEsislaSinglePassERefinar:
    def test_api_ai_esisla_single_pass_direct_com_ia2_estruturado(self, monkeypatch):
        monkeypatch.setattr(
            app_module,
            "_authenticate_request",
            lambda: ({"id": "1", "email": "admin@ambiental.com", "nome": "Admin", "perfil": "Administrador"}, "token123"),
        )
        raw = _base_payload(
            _ia2Estruturado=True,
            queixa_duracao=(
                "Servidora de 44 anos, relatou não ser readaptada, é Professora de Educação Básica II há 12 anos, "
                "com queixa de lombalgia aguda desde 2026, realizando consultas mensalmente. Refere dor lombar intensa "
                "com dificuldade para permanência em ortostatismo prolongado. Em uso de Dipirona 1 g se dor. "
                "Não relatou troca de medicação ou alteração de dosagem. Realiza fisioterapia e não realiza psicoterapia."
            ),
            exame_fisico_descricao=(
                "Aparelho Osteomuscular e Tecido Conjutivo: Ao exame físico osteomuscular pericial, a periciada "
                "apresenta postura antálgica, contratura paravertebral lombar bilateral e dor à digitopressão em L4-L5."
            ),
            justificativa=(
                "Considero a capacidade laborativa parcial e temporariamente prejudicada frente às atribuições do Rol "
                "de Atividades do cargo de Professor de Educação Básica II em razão da lombalgia aguda incapacitante."
            ),
        )
        client = app_module.app.test_client()
        with patch.object(app_module, "_get_stored_ficha_esisla", return_value=""), \
             patch.object(app_module, "_save_ficha_esisla_to_atendimento", return_value=True), \
             patch.object(app_module, "_load_authoritative_ai_payload", side_effect=lambda x: x), \
             patch.object(app_module, "_generate_cached", side_effect=AssertionError("Não deve chamar LLM em Single-Pass direto")):
            resp = client.post("/api/ai/esisla", json=raw)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["meta"]["single_pass_direct"] is True
        assert data["qualidade"]["score"] >= 95
        assert data["qualidade"]["criticos"] == []
        assert "Médico Perito: Dra. Francimara de Souza" in data["ficha_esisla"]

    def test_api_ai_esisla_fallback_sem_ia_retorna_auditoria_aprovada(self, monkeypatch):
        monkeypatch.setattr(
            app_module,
            "_authenticate_request",
            lambda: ({"id": "1", "email": "admin@ambiental.com", "nome": "Admin", "perfil": "Administrador"}, "token123"),
        )
        raw = _base_payload(atendimento="")
        client = app_module.app.test_client()
        with patch.object(app_module, "_load_authoritative_ai_payload", side_effect=lambda x: x), \
             patch.object(app_module, "_generate_cached", side_effect=RuntimeError("API sem créditos")):
            resp = client.post("/api/ai/esisla", json=raw)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["qualidade"]["score"] >= 95
        assert data["qualidade"]["criticos"] == []
        assert "Considero " in data["ficha_esisla"]

    def test_api_ai_refinar_ficha_esisla_usa_generate_structured_e_gatekeeper(self, monkeypatch):
        monkeypatch.setattr(
            app_module,
            "_authenticate_request",
            lambda: ({"id": "1", "email": "admin@ambiental.com", "nome": "Admin", "perfil": "Administrador"}, "token123"),
        )
        ficha_ruim = (
            "Registro da perícia Médica para Licença\n\n"
            "(*) Queixa e Duração: Servidora de 40 anos, relatou não ser readaptada, é Professora há 0 anos, "
            "com queixa de depressão. Em uso de Clonazepam 0.5 mg e Nebacetin, não informada sua dosagem. "
            "Não relatou troca de alteração de dosagem da medicação.\n\n"
            "Antecedentes Mórbidos\nNega.\n\n"
            "Atestado/Relatório/Exames Complementares\nEm anexo. Constatação pericial: atestado de 10 dias.\n\n"
            "Pressão Arterial\nSistólica (mmHg): 12\nDiastólica (mmHg): 8\nPulso (bpm): 76\n\n"
            "Altura: 165\nPeso: 68\n\n"
            "(*) Exame Físico Geral\nServidor(a) em bom estado geral (BEG), lúcido(a) e orientado(a) (LOTE).\n\n"
            "Descrição das Alterações Clínicas encontradas e Relato dos Exames Complementares:\n"
            "Alterações psíquicas compatíveis com depressão.\n\n"
            "(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is) encontrada(s)\n"
            "Apresenta limitações no cargo de Professor de Educação Básica II, atividades estas constantes no Rol de Atividades do cargo de Professor de Educação Básica II.\n\n"
            "(*) Parecer Médico\nParecer: FAVORÁVEL\nNº Dias: 15\nData Início: 10/10/2026\nCID 10: F32.1\n"
            "Descrição: Episódio depressivo moderado\nCID 10 Secundário:\nDescrição Secundária:\n"
            "Médico Perito: Dr. Francimara Silva\nCRM: 12345\nDt/Hr Perícia: 12/10/2026 10:00\n\n"
            "(*) Resposta aos quesitos\n1) Sim\n2) Sim\n3) Sim\n\n"
            "(*) Justificativa Parecer Médico\n"
            "Fundamenta-se a incapacidade (CID F32.1) pelo período concedido de 15 dias.\n\n"
            "(*) Parecer Final\nNº Dias: 15\nData Início: 10/10/2026\nCID 10: F32.1\nDescrição: Episódio depressivo moderado\n"
            "CID 10 Secundário:\nDescrição Secundária:\nDiretor DPME:\nData P.F.:\n"
        )
        client = app_module.app.test_client()
        with patch.object(app_module, "_generate_structured", side_effect=RuntimeError("offline")):
            resp = client.post("/api/ai/refinar-ficha-esisla", json={"ficha_esisla": ficha_ruim})
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["success"] is True
        d = body["data"]
        ficha_out = d["ficha_esisla_otimizada"]
        assert d["qualidade"]["criticos"] == [], f"Críticos restantes: {d['qualidade']['criticos']}\n{ficha_out}"
        assert d["qualidade"]["score"] >= 95, f"Score baixo: {d['qualidade']}\n{ficha_out}"
        assert "Servidor(a)" not in ficha_out
        assert "(BEG)" not in ficha_out and "(LOTE)" not in ficha_out
        assert "Constatação pericial" not in ficha_out
        assert "Dra. Francimara Silva" in ficha_out
        assert "0,5 mg" in ficha_out and "0.5 mg" not in ficha_out
        assert "há 0 anos" not in ficha_out.lower()
        assert "15 dias" not in ficha_out.split("Justificativa Parecer Médico:")[1].split("Parecer Final")[0]


class TestFrontendEsislaGuards:
    def test_gestao_atendimentos_preserva_exame_editado_e_exibe_auditoria(self):
        js = Path("gestao_atendimentos.js").read_text(encoding="utf-8")
        assert "let exApres = (exameFisicoTexto || docExame).trim();" in js
        assert "window._esislaUltimaQualidade" in js
        assert "Auditoria DPME" in js

    def test_ambiental_assistente_higiene_medicacoes_e_tempo_cargo(self):
        js = Path("ambiental_assistente.js").read_text(encoding="utf-8")
        assert "sintomaticos" in js
        assert "_isTopicalOrSaline" in js
        assert "_fmtDosePtBr" in js

    def test_ambiental_assistente_trava_vinculo_e_variedade_queixa(self):
        js = Path("ambiental_assistente.js").read_text(encoding="utf-8")
        assert "aplicarTravaCamposVinculados" in js
        assert "toggleTravaCamposVinculados" in js
        assert "btnToggleTravaVinculo" in js
        assert "montarContextoIA2ComFichaVinculada" in js
        assert "cid_primario_travado" in js
        assert "styleIdx" in js


class TestVariedadeQueixaEFichaVinculadaIA2:
    def test_variedade_redacional_queixa_mantem_ordem_dpme_e_nota_100(self):
        queixas = []
        aberturas = set()
        for idx in range(12):
            raw = _base_payload(
                atendimento=f"999100{idx:03d}",
                nome_paciente=f"Maria Clara Teste {idx}",
                cid=["M54.5", "F32.1", "J06.9", "M75.1"][idx % 4],
                doenca_motivo=["Lombalgia aguda", "Episódio depressivo moderado", "Infecção aguda das vias aéreas", "Síndrome do manguito rotador"][idx % 4],
            )
            payload = app_module._minimal_ai_context(raw)
            ficha = app_module._build_deterministic_esisla(payload)
            ficha = app_module._gatekeeper_anti_glosa_esisla(ficha, payload)
            audit = app_module.auditar_ficha_esisla(ficha, payload)
            assert audit["criticos"] == [], f"Idx {idx} com críticos: {audit['criticos']}\n{ficha}"
            assert audit["score"] >= 95, f"Idx {idx} score {audit['score']}: {audit['alertas']}\n{ficha}"
            m_q = re.search(r"\(\*\)\s*Queixa e Duração:\n(.*?)\n\nAntecedentes Mórbidos:", ficha, re.S)
            assert m_q, f"Sem Queixa e Duração no idx {idx}"
            q = m_q.group(1).strip()
            queixas.append(q)
            aberturas.add(q[:45])
            # Ordem DPME obrigatória: idade -> readaptação -> cargo -> sintomas -> medicação -> terapias
            pos_idade = q.find("44 anos")
            pos_readap = re.search(r"readaptad|readapta[çc][ãa]o", q, re.I)
            pos_cargo = re.search(r"Professor", q, re.I)
            pos_med = re.search(r"Dipirona", q, re.I)
            pos_ter = re.search(r"fisioter[aá]p", q, re.I)
            assert pos_idade >= 0 and pos_readap and pos_cargo and pos_med and pos_ter
            assert pos_idade < pos_readap.start() < pos_cargo.start() < pos_med.start() < pos_ter.start()

        assert len(aberturas) >= 3, f"Esperava >= 3 estilos distintos de abertura, obteve {len(aberturas)}: {aberturas}"

    def test_ia2_ficha_vinculada_protege_cid_primario_e_promove_cid_secundario_correlacionado(self, monkeypatch):
        monkeypatch.setattr(
            app_module,
            "_authenticate_request",
            lambda: ({"id": "1", "email": "admin@ambiental.com", "nome": "Admin", "perfil": "Administrador"}, "token123"),
        )
        captured_prompts = []

        def _fake_generate_structured(prompt, schema, **kwargs):
            captured_prompts.append(prompt)
            return schema(
                nome_paciente="Nome Alterado Indevidamente",
                idade="99",
                cargo="AUXILIAR DE SERVICOS GERAIS",
                dias_solicitados="30",
                cid="M51.1",  # LLM tenta trocar CID primário M54.5 por M51.1
                cids_secundarios=["G54.4"],
                doenca_motivo="Lombociatalgia com compressão radicular",
                inicio_tratamento="2026",
                frequencia_consultas="mensal",
                sintomas_limitacao="Dor lombar irradiada para membro inferior direito com parestesia e dificuldade para ortostatismo prolongado.",
                exame_fisico_tipo="Aparelho Osteomuscular e Tecido Conjutivo",
                exame_fisico_descricao="Postura antálgica, dor à palpação paravertebral lombar bilateral e Lasègue positivo à direita.",
                parecer="FAVORÁVEL",
                justificativa="Considero a capacidade laborativa parcial e temporariamente prejudicada frente às atribuições do cargo.",
            )

        client = app_module.app.test_client()
        req_payload = {
            "texto_bruto": "Paciente traz atestado ortopédico com dor lombar irradiada para perna direita, suspeita de hérnia discal L4-L5 com radiculopatia, usa dipirona 1g.",
            "atendimento": "999200101",
            "modo_ia2": True,
            "contexto_atual": {
                "nomePaciente": "Maria Aparecida da Silva",
                "cpfPaciente": "123.456.789-00",
                "idade": "44",
                "sexo": "Feminino",
                "cargo": "PROFESSOR DE EDUCACAO BASICA II",
                "tempoCargo": "12",
                "tempoUnidade": "Anos",
                "readaptado": "Não",
                "cid": "M54.5",
                "cidAncoraConfirmado": True,
                "fichaVinculada": True,
                "diasSolicitados": "15",
                "dataDocumento": "2026-10-10",
                "crmCro": "123456",
            },
            "ficha_vinculada": {
                "ativa": True,
                "trava_ativa": True,
                "campos_travados": ["nomePaciente", "idade", "cargo", "cid", "diasSolicitados", "crmCro"],
                "cid_primario_travado": "M54.5",
                "dados": {
                    "nomePaciente": "Maria Aparecida da Silva",
                    "idade": "44",
                    "cargo": "PROFESSOR DE EDUCACAO BASICA II",
                    "cid": "M54.5",
                    "diasSolicitados": "15",
                    "crmCro": "123456",
                },
                "motivo_pericia": "Licença para tratamento de saúde",
                "ultima_licenca_dias": "10",
            },
        }
        with patch.object(app_module, "_generate_structured", side_effect=_fake_generate_structured):
            resp = client.post("/api/ai/preencher-ficha", json=req_payload)

        assert resp.status_code == 200, resp.get_data(as_text=True)
        body = resp.get_json()
        dados = body.get("dados") or body

        # 1) Prompt enviado à IA inclui bloco de ficha vinculada e CID primário âncora
        assert captured_prompts
        assert "FICHA VINCULADA" in captured_prompts[0]
        assert "M54.5" in captured_prompts[0]
        assert "SEM modificar o CID primário" in captured_prompts[0] or "IMUTÁVEL" in captured_prompts[0]

        # 2) CID primário M54.5 permanece intocado
        assert dados["cid"] == "M54.5"

        # 3) CID sugerido pela IA (M51.1) foi promovido a CID secundário correlacionado, preservando G54.4
        sec_codes = [
            (item.get("cid") if isinstance(item, dict) else str(item)).strip().upper()
            for item in (dados.get("cids_secundarios") or [])
        ]
        assert "M51.1" in sec_codes, f"Esperava M51.1 como CID secundário correlacionado, veio: {sec_codes}"
        assert "G54.4" in sec_codes

        # 4) Campos travados da ficha vinculada não foram sobrescritos pela IA
        assert dados.get("nome_paciente") == "Maria Aparecida da Silva"
        assert str(dados.get("idade")) == "44"
        assert "professor de educação básica ii" in str(dados.get("cargo") or "").lower()
        assert "auxiliar" not in str(dados.get("cargo") or "").lower()
        assert str(dados.get("dias_solicitados")) == "15"
        assert str(dados.get("crm_cro")) == "123456"
