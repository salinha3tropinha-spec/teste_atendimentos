"""
Teste de Simulação do Ciclo Completo e Isolamento Multi-Perito:
Simula 5 atendimentos periciais com 2 médicos peritos distintos:
- Dr. Maykon (CRM 158158, user_id: perito_maykon_001):
  1) Ortopedia (M54.4 - Favorável 30 dias)
  2) Psiquiatria (F32.2 - Favorável 45 dias)
  3) Retroação Extemporânea > 3 dias (M51.1 - Contrário 0 dias)
- Dra. Juliana (CRM 234567, user_id: perita_juliana_002):
  4) Servidor Readaptado na Doença de Base (M54.5 - Contrário 0 dias)
  5) Acompanhamento Familiar Z76.3 (Z76.3 - Contrário 0 dias)

Validações Obrigatórias:
- Entrada e processamento do laudo e-SISLA
- Acionamento do fluxo de finalização definitiva (POST /api/atendimentos seguido de /state para FINALIZADO)
- Persistência e integridade absoluta dos dados no banco
- Estrito isolamento de sessões:
  * Dr. Maykon lista apenas seus 3 atendimentos
  * Dra. Juliana lista apenas seus 2 atendimentos
  * Tentativa de Dr. Maykon acessar atendimento de Dra. Juliana é BLOQUEADA (HTTP 403)
  * Tentativa de Dra. Juliana acessar atendimento de Dr. Maykon é BLOQUEADA (HTTP 403)
  * Perfil Administrador visualiza todos os 5 atendimentos
"""

import pytest
import json
import uuid
import re
from app import (
    app,
    get_db,
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla,
    _utc_now,
)

PREFIX = "TEST_MULTI_"
IDS_CRIADOS = []


@pytest.fixture(autouse=True)
def teardown_multi_perito():
    yield
    with app.app_context():
        try:
            db = get_db()
            with db.cursor() as cur:
                if IDS_CRIADOS:
                    cur.execute(
                        "DELETE FROM atendimentos WHERE id = ANY(%s) OR numero LIKE %s",
                        (IDS_CRIADOS, f"{PREFIX}%")
                    )
                    cur.execute(
                        "DELETE FROM auditoria_acessos WHERE atendimento_id = ANY(%s)",
                        (IDS_CRIADOS,)
                    )
                    db.commit()
        except Exception as e:
            print("Teardown multi perito aviso:", e)


def test_ciclo_completo_e_isolamento_multi_perito(monkeypatch):
    client = app.test_client()

    # Definição dos 2 médicos peritos
    doc_1 = {"id": "perito_maykon_001", "nome": "Dr. Maykon", "crm": "158158", "perfil": "Médico", "email": "maykon@dpme.sp.gov.br"}
    doc_2 = {"id": "perita_juliana_002", "nome": "Dra. Juliana", "crm": "234567", "perfil": "Médico", "email": "juliana@dpme.sp.gov.br"}
    admin = {"id": "usr_admin_001", "nome": "Diretor DPME", "crm": "", "perfil": "Administrador", "email": "diretor@dpme.sp.gov.br"}

    # Mock de autenticação dinâmico
    auth_state = {"user": doc_1}

    def _dynamic_auth():
        return (auth_state["user"], "token_jwt_valido")

    monkeypatch.setattr("app._authenticate_request", _dynamic_auth)

    # 5 Casos distribuídos entre os peritos
    casos = [
        # Médico 1: Dr. Maykon
        {
            "doc": doc_1,
            "numero": f"{PREFIX}001_{uuid.uuid4().hex[:6]}",
            "nome": "Fernando Souza",
            "cpf": "123.456.789-01",
            "cargo": "Professor de Educação Básica II",
            "cid": "M54.4",
            "desc": "Lombociatalgia aguda incapacitante",
            "parecer": "FAVORÁVEL",
            "dias": 30,
            "readaptado": "Não",
            "retroacao": False,
            "ef": "Marcha claudicante com Lasègue positivo a 40 graus à direita.",
            "sintomas": "Dor lombar aguda com irradiação para membro inferior direito."
        },
        {
            "doc": doc_1,
            "numero": f"{PREFIX}002_{uuid.uuid4().hex[:6]}",
            "nome": "Renata Alencar",
            "cpf": "234.567.890-12",
            "cargo": "Agente de Organização Escolar",
            "cid": "F32.2",
            "desc": "Episódio depressivo grave",
            "parecer": "FAVORÁVEL",
            "dias": 45,
            "readaptado": "Não",
            "retroacao": False,
            "ef": "Humor hipotímico, lentificação psicomotora, sem sintomas psicóticos.",
            "sintomas": "Anedonia, choro fácil, insônia terminal e desânimo acentuado."
        },
        {
            "doc": doc_1,
            "numero": f"{PREFIX}003_{uuid.uuid4().hex[:6]}",
            "nome": "Gustavo Mendes",
            "cpf": "345.678.901-23",
            "cargo": "Oficial Administrativo",
            "cid": "M51.1",
            "desc": "Transtorno de disco lombar",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Não",
            "retroacao": True,
            "retro_dias": 15,
            "dt_doc": "2026-01-05",
            "dt_exp": "2026-01-20",
            "ef": "Coluna lombar dolorosa à palpação, Lasègue positivo à esquerda.",
            "sintomas": "Lombociatalgia com emissão extemporânea da guia."
        },
        # Médica 2: Dra. Juliana
        {
            "doc": doc_2,
            "numero": f"{PREFIX}004_{uuid.uuid4().hex[:6]}",
            "nome": "Patrícia Barbosa",
            "cpf": "456.789.012-34",
            "cargo": "Professor de Educação Básica I",
            "cid": "M54.5",
            "desc": "Dor lombar baixa crônica",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Sim",
            "atividades_readap": "suporte de secretaria escolar e atendimento telefônico",
            "retroacao": False,
            "ef": "Mobilidade lombar satisfatória para atividades sem esforço físico.",
            "sintomas": "Dor lombar habitual em servidora readaptada adaptada ao termo."
        },
        {
            "doc": doc_2,
            "numero": f"{PREFIX}005_{uuid.uuid4().hex[:6]}",
            "nome": "Leandro Castro",
            "cpf": "567.890.123-45",
            "cargo": "Agente Técnico de Assistência à Saúde",
            "cid": "Z76.3",
            "desc": "Pessoa em boa saúde acompanhando pessoa doente",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Não",
            "retroacao": False,
            "ef": "Servidor lúcido, orientado, afebril, higido, sem alterações clínicas próprias.",
            "sintomas": "Acompanhamento de dependente enfermo em tratamento."
        }
    ]

    saved_records = []

    # 1. Executa o ciclo de vida completo de cada atendimento sob a sessão de seu médico
    for c in casos:
        # Define a sessão do médico responsável
        auth_state["user"] = c["doc"]

        # Geração da ficha e-SISLA determinística + Gatekeeper
        genesis_p = {
            "atendimento": c["numero"],
            "nome": c["nome"],
            "nomePaciente": c["nome"],
            "cpf": c["cpf"],
            "cpfPaciente": c["cpf"],
            "cargo": c["cargo"],
            "cid": c["cid"],
            "doenca_motivo": c["desc"],
            "parecer": c["parecer"],
            "dias_solicitados": c["dias"],
            "dias": c["dias"],
            "readaptado": c["readaptado"],
            "atividades_readaptado": c.get("atividades_readap", ""),
            "retroacao_invalida": c["retroacao"],
            "retroacao_dias": c.get("retro_dias"),
            "data_documento": c.get("dt_doc", "2026-02-01"),
            "data_expedicao": c.get("dt_exp", "2026-02-02"),
            "sintomas_limitacoes": c["sintomas"],
            "exame_fisico_descricao": c["ef"],
            "medico_perito": c["doc"]["nome"],
            "crm": c["doc"]["crm"],
            "pressao_sistolica": "120",
            "pressao_diastolica": "80",
            "pulso": "75",
        }
        laudo_esisla = _gatekeeper_anti_glosa_esisla(_build_deterministic_esisla(genesis_p), genesis_p)

        # Salva o atendimento via POST /api/atendimentos
        save_p = {
            "atendimento": c["numero"],
            "pacienteNome": c["nome"],
            "pacienteCpf": c["cpf"],
            "cargo": c["cargo"],
            "readaptado": c["readaptado"],
            "limitacaoFuncional": "Sim" if c["parecer"] == "FAVORÁVEL" else "Não",
            "limitacaoRol": "Sim" if c["parecer"] == "FAVORÁVEL" else "Não",
            "capacidade": "Prejudicada temporariamente" if c["parecer"] == "FAVORÁVEL" else "Preservada",
            "exameFisicoTipo": "Outros",
            "exameFisicoDescricao": c["ef"],
            "cid": c["cid"],
            "cidDescricao": c["desc"],
            "parecer": c["parecer"],
            "dias": c["dias"],
            "workflowStatus": "RASCUNHO",
            "ficha_esisla": laudo_esisla,
            "quesitos": [
                {"id": 1, "pergunta": "Há doença?", "resposta": "Sim"},
                {"id": 2, "pergunta": "Gera limitação?", "resposta": "Sim" if c["parecer"] == "FAVORÁVEL" or c["readaptado"] == "Sim" else "Não"},
                {"id": 3, "pergunta": "Impede o rol?", "resposta": "Sim" if c["parecer"] == "FAVORÁVEL" else "Não"},
            ],
            "aux": {
                "cargo": c["cargo"],
                "idade": "38",
                "readaptado": c["readaptado"],
                "doencaMotivo": c["desc"],
                "sintomasLimitacao": c["sintomas"],
                "cid": c["cid"],
                "limitacaoFuncional": "Sim" if c["parecer"] == "FAVORÁVEL" else "Não",
                "limitacaoRol": "Sim" if c["parecer"] == "FAVORÁVEL" else "Não",
                "justificativa": f"Capacidade laborativa {'prejudicada' if c['parecer'] == 'FAVORÁVEL' else 'preservada'}.",
                "medicoResponsavel": c["doc"]["nome"],
                "crmResponsavel": c["doc"]["crm"],
                "fichaEsisla": laudo_esisla,
                "retroacaoInvalida": c["retroacao"],
            }
        }
        res_save = client.post("/api/atendimentos", json=save_p)
        assert res_save.status_code in (200, 201), f"Erro ao criar atendimento {c['numero']}: {res_save.get_data(as_text=True)}"
        save_json = res_save.get_json()
        saved_id = (save_json.get("data") or {}).get("id") or save_json.get("id")
        IDS_CRIADOS.append(saved_id)

        # Transição oficial para FINALIZADO
        res_state = client.post(f"/api/atendimentos/{saved_id}/state", json={"estado": "FINALIZADO"})
        assert res_state.status_code == 200, f"Erro ao finalizar {saved_id}: {res_state.get_data(as_text=True)}"

        # Consulta e valida integridade dos dados salvos
        res_get = client.get(f"/api/atendimentos/{saved_id}")
        assert res_get.status_code == 200
        get_json = res_get.get_json()
        get_d = get_json.get("data") or get_json
        assert get_d.get("atendimento") == c["numero"]
        assert get_d.get("status") in ("FINALIZADO", "Finalizado")

        p_stored = get_d.get("payload") or {}
        assert p_stored.get("cid") == c["cid"]
        assert p_stored.get("parecer") == c["parecer"]
        assert int(p_stored.get("dias")) == c["dias"]
        assert p_stored.get("ficha_esisla") == laudo_esisla

        saved_records.append({
            "id": saved_id,
            "numero": c["numero"],
            "doc": c["doc"]
        })

    # 2. Validação estrita do isolamento de sessões entre os peritos
    # Sessão Dr. Maykon (deve ver atendimentos 1, 2, 3; NENHUM de Dra. Juliana)
    auth_state["user"] = doc_1
    res_list_1 = client.get("/api/atendimentos?page=1&pageSize=50")
    assert res_list_1.status_code == 200
    list_1_items = (res_list_1.get_json().get("data") or {}).get("items") or []
    list_1_nums = {item.get("atendimento") or item.get("numero") for item in list_1_items}

    for rec in saved_records[:3]:
        assert rec["numero"] in list_1_nums, f"Dr. Maykon não encontrou seu próprio atendimento: {rec['numero']}"
    for rec in saved_records[3:]:
        assert rec["numero"] not in list_1_nums, f"VAZAMENTO DE SEGURANÇA: Dr. Maykon visualizou atendimento de Dra. Juliana: {rec['numero']}!"

    # Sessão Dra. Juliana (deve ver atendimentos 4, 5; NENHUM de Dr. Maykon)
    auth_state["user"] = doc_2
    res_list_2 = client.get("/api/atendimentos?page=1&pageSize=50")
    assert res_list_2.status_code == 200
    list_2_items = (res_list_2.get_json().get("data") or {}).get("items") or []
    list_2_nums = {item.get("atendimento") or item.get("numero") for item in list_2_items}

    for rec in saved_records[3:]:
        assert rec["numero"] in list_2_nums, f"Dra. Juliana não encontrou seu próprio atendimento: {rec['numero']}"
    for rec in saved_records[:3]:
        assert rec["numero"] not in list_2_nums, f"VAZAMENTO DE SEGURANÇA: Dra. Juliana visualizou atendimento de Dr. Maykon: {rec['numero']}!"

    # 3. Tentativas de acesso direto cruzado via GET /api/atendimentos/<id> (devem ser BLOQUEADAS com HTTP 403)
    # Dr. Maykon tenta acessar atendimento de Dra. Juliana
    auth_state["user"] = doc_1
    res_cross_1 = client.get(f"/api/atendimentos/{saved_records[3]['id']}")
    assert res_cross_1.status_code == 403, f"Acesso cruzado indevido permitido! Status: {res_cross_1.status_code}"

    # Dra. Juliana tenta acessar atendimento de Dr. Maykon
    auth_state["user"] = doc_2
    res_cross_2 = client.get(f"/api/atendimentos/{saved_records[0]['id']}")
    assert res_cross_2.status_code == 403, f"Acesso cruzado indevido permitido! Status: {res_cross_2.status_code}"

    # 4. Perfil Administrador visualiza todos os atendimentos
    auth_state["user"] = admin
    res_admin = client.get("/api/atendimentos?page=1&pageSize=50")
    assert res_admin.status_code == 200
    admin_items = (res_admin.get_json().get("data") or {}).get("items") or []
    admin_nums = {item.get("atendimento") or item.get("numero") for item in admin_items}

    for rec in saved_records:
        assert rec["numero"] in admin_nums, f"Administrador não encontrou atendimento: {rec['numero']}"
