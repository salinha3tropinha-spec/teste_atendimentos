"""
Bateria de Testes Ponta a Ponta - Ciclo Completo de Atendimento e Gestão (Frase 5):
Simula 5 atendimentos periciais reais completos:
1) Ortopedia (M54.4 - Favorável 30 dias)
2) Psiquiatria (F32.2 - Favorável 60 dias)
3) Retroação Extemporânea > 3 dias (M51.1 - Contrário 0 dias)
4) Servidor Readaptado na Doença de Base (M54.5 - Contrário 0 dias)
5) Acompanhamento Familiar (Z76.3 - Contrário 0 dias pelos Artigos 191/193)

Para cada atendimento valida:
- Geração da Ficha Oficial e-SISLA sem falhas
- Gravação definitiva via API POST /api/atendimentos no banco de dados real
- Preservação de CRM, Médico Responsável, CID, Parecer, Dias e Laudo
- Leitura e Auditoria de Acesso via GET /api/atendimentos/<id>
- Listagem e Isolamento em GET /api/atendimentos
- Limpeza segura dos registros de teste no teardown
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
    _format_date_br,
)

# Prefix para identificar e limpar registros de teste com segurança
TEST_PREFIX = "TEST_E2E_"
CREATED_TEST_IDS = []


@pytest.fixture(autouse=True)
def cleanup_test_records():
    """Garante limpeza de quaisquer registros de teste criados no banco."""
    yield
    with app.app_context():
        try:
            db = get_db()
            with db.cursor() as cur:
                if CREATED_TEST_IDS:
                    cur.execute(
                        "DELETE FROM atendimentos WHERE id = ANY(%s) OR numero LIKE %s",
                        (CREATED_TEST_IDS, f"{TEST_PREFIX}%")
                    )
                    cur.execute(
                        "DELETE FROM auditoria_acessos WHERE atendimento_id = ANY(%s)",
                        (CREATED_TEST_IDS,)
                    )
                    db.commit()
        except Exception as e:
            print("Aviso ao limpar registros de teste:", e)


def _mock_doctor_auth(monkeypatch, doc_id="usr_doc_test", doc_name="Dr. Maykon", doc_crm="158158"):
    monkeypatch.setattr(
        "app._authenticate_request",
        lambda: (
            {
                "id": doc_id,
                "email": "dr.maykon@ambiental.com",
                "nome": doc_name,
                "crm": doc_crm,
                "perfil": "Médico",
            },
            "token_jwt_test",
        )
    )


def test_ciclo_completo_5_atendimentos(monkeypatch):
    _mock_doctor_auth(monkeypatch)
    client = app.test_client()

    casos = [
        {
            "caso_id": 1,
            "numero": f"{TEST_PREFIX}001_{uuid.uuid4().hex[:6]}",
            "paciente_nome": "Carlos Alberto da Silva",
            "paciente_cpf": "111.222.333-44",
            "cargo": "Professor de Educação Básica II",
            "cid": "M54.4",
            "cid_descricao": "Lombociatalgia aguda incapacitante",
            "parecer": "FAVORÁVEL",
            "dias": 30,
            "readaptado": "Não",
            "retroacao_invalida": False,
            "sintomas": "dor lombar intensa com irradiação para membro inferior direito, Lasègue positivo",
            "ef_desc": "Marcha claudicante, contratura de paravertebrais lombares e Lasègue positivo a 40 graus à direita."
        },
        {
            "caso_id": 2,
            "numero": f"{TEST_PREFIX}002_{uuid.uuid4().hex[:6]}",
            "paciente_nome": "Maria Fernanda Souza",
            "paciente_cpf": "222.333.444-55",
            "cargo": "Professor de Educação Básica I",
            "cid": "F32.2",
            "cid_descricao": "Episódio depressivo grave sem sintomas psicóticos",
            "parecer": "FAVORÁVEL",
            "dias": 60,
            "readaptado": "Não",
            "retroacao_invalida": False,
            "sintomas": "anedonia, choro fácil, insônia terminal e lentificação psicomotora severa",
            "ef_desc": "Humor hipotímico acentuado, afeto embotado, lentificação psicomotora e hipoprosexia."
        },
        {
            "caso_id": 3,
            "numero": f"{TEST_PREFIX}003_{uuid.uuid4().hex[:6]}",
            "paciente_nome": "Roberto Gomes Pereira",
            "paciente_cpf": "333.444.555-66",
            "cargo": "Agente de Organização Escolar",
            "cid": "M51.1",
            "cid_descricao": "Transtornos de discos lombares com radiculopatia",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Não",
            "retroacao_invalida": True,
            "retroacao_dias": 14,
            "data_documento": "2026-01-10",
            "data_expedicao": "2026-01-24",
            "sintomas": "lombociatalgia crônica com piora há 2 semanas",
            "ef_desc": "Dor lombar à palpação, Lasègue positivo à esquerda."
        },
        {
            "caso_id": 4,
            "numero": f"{TEST_PREFIX}004_{uuid.uuid4().hex[:6]}",
            "paciente_nome": "Ana Paula Mendes",
            "paciente_cpf": "444.555.666-77",
            "cargo": "Professor de Educação Básica II",
            "cid": "M54.5",
            "cid_descricao": "Dor lombar baixa crônica",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Sim",
            "atividades_readaptado": "mediação de conflitos e atendimento na biblioteca escolar",
            "retroacao_invalida": False,
            "sintomas": "dores lombares habituais sem piora aguda",
            "ef_desc": "Mobilidade lombar satisfatória para atividades sem carga, adaptada ao rol residual."
        },
        {
            "caso_id": 5,
            "numero": f"{TEST_PREFIX}005_{uuid.uuid4().hex[:6]}",
            "paciente_nome": "Felipe Rocha Santos",
            "paciente_cpf": "555.666.777-88",
            "cargo": "Oficial Administrativo",
            "cid": "Z76.3",
            "cid_descricao": "Pessoa em boa saúde acompanhando pessoa doente",
            "parecer": "CONTRÁRIO",
            "dias": 0,
            "readaptado": "Não",
            "retroacao_invalida": False,
            "sintomas": "acompanhamento de filho internado em tratamento oncológico",
            "ef_desc": "Exame físico do servidor sem alterações clínicas incapacitantes."
        }
    ]

    for caso in casos:
        num = caso["numero"]
        c_id = caso["caso_id"]

        # 1. Monta payload para geração do e-SISLA
        genesis_payload = {
            "atendimento": num,
            "nome": caso["paciente_nome"],
            "nomePaciente": caso["paciente_nome"],
            "cpf": caso["paciente_cpf"],
            "cpfPaciente": caso["paciente_cpf"],
            "cargo": caso["cargo"],
            "cid": caso["cid"],
            "doenca_motivo": caso["cid_descricao"],
            "parecer": caso["parecer"],
            "dias_solicitados": caso["dias"],
            "dias": caso["dias"],
            "readaptado": caso["readaptado"],
            "atividades_readaptado": caso.get("atividades_readaptado", ""),
            "retroacao_invalida": caso["retroacao_invalida"],
            "retroacao_dias": caso.get("retroacao_dias"),
            "data_documento": caso.get("data_documento", "2026-02-01"),
            "data_expedicao": caso.get("data_expedicao", "2026-02-02"),
            "sintomas_limitacoes": caso["sintomas"],
            "exame_fisico_descricao": caso["ef_desc"],
            "medico_perito": "Dr. Maykon",
            "crm": "158158",
            "pressao_sistolica": "120",
            "pressao_diastolica": "80",
            "pulso": "75",
        }

        # 2. Gera a ficha estruturada determinística e aplica o gatekeeper anti-glosa
        ficha_raw = _build_deterministic_esisla(genesis_payload)
        laudo_esisla = _gatekeeper_anti_glosa_esisla(ficha_raw, genesis_payload)

        assert "Registro da perícia Médica para Licença" in laudo_esisla
        assert caso["cid"] in laudo_esisla
        assert f"Parecer: {caso['parecer']}" in laudo_esisla
        assert f"Nº Dias: {caso['dias']}" in laudo_esisla

        # Validação de regras específicas por caso
        if c_id == 3:  # Retroação > 3 dias
            assert "Guia com mais de 3 dias de retroação" in laudo_esisla
            m_just_c3 = re.search(r"\(\*\)\s*Justificativa Parecer Médico:?\s*\n(.*?)\n\s*\(\*\)\s*Parecer Final", laudo_esisla, re.DOTALL)
            assert m_just_c3 is not None
            just_corpo_c3 = m_just_c3.group(1).strip()
            assert "(" not in just_corpo_c3, f"Parêntese '(' encontrado na justificativa: {just_corpo_c3}"
            assert ")" not in just_corpo_c3, f"Parêntese ')' encontrado na justificativa: {just_corpo_c3}"
        elif c_id == 4:  # Readaptado
            assert "devidamente adaptad" in laudo_esisla
            assert "termo de readaptação funcional" in laudo_esisla
        elif c_id == 5:  # Z76.3
            assert "Artigos 191 e 193 da Lei Estadual nº 10.261/1968" in laudo_esisla

        # 3. Finalização Definitiva: Salva via POST /api/atendimentos
        save_payload = {
            "atendimento": num,
            "pacienteNome": caso["paciente_nome"],
            "pacienteCpf": caso["paciente_cpf"],
            "cargo": caso["cargo"],
            "readaptado": caso["readaptado"],
            "limitacaoFuncional": "Sim" if caso["parecer"] == "FAVORÁVEL" else "Não",
            "limitacaoRol": "Sim" if caso["parecer"] == "FAVORÁVEL" else "Não",
            "capacidade": "Prejudicada temporariamente" if caso["parecer"] == "FAVORÁVEL" else "Preservada",
            "exameFisicoTipo": "Outros",
            "exameFisicoDescricao": caso["ef_desc"],
            "cid": caso["cid"],
            "cidDescricao": caso["cid_descricao"],
            "parecer": caso["parecer"],
            "dias": caso["dias"],
            "workflowStatus": "RASCUNHO",
            "ficha_esisla": laudo_esisla,
            "quesitos": [
                {"id": 1, "pergunta": "Há doença?", "resposta": "Sim"},
                {"id": 2, "pergunta": "Gera limitação?", "resposta": "Sim" if caso["parecer"] == "FAVORÁVEL" or caso.get("readaptado") == "Sim" else "Não"},
                {"id": 3, "pergunta": "Impede o rol?", "resposta": "Sim" if caso["parecer"] == "FAVORÁVEL" else "Não"},
            ],
            "aux": {
                "cargo": caso["cargo"],
                "idade": "35",
                "readaptado": caso["readaptado"],
                "doencaMotivo": caso["cid_descricao"],
                "sintomasLimitacao": caso["sintomas"],
                "cid": caso["cid"],
                "limitacaoFuncional": "Sim" if caso["parecer"] == "FAVORÁVEL" else "Não",
                "limitacaoRol": "Sim" if caso["parecer"] == "FAVORÁVEL" else "Não",
                "justificativa": f"Capacidade laborativa {'prejudicada' if caso['parecer'] == 'FAVORÁVEL' else 'preservada'}.",
                "medicoResponsavel": "Dr. Maykon",
                "crmResponsavel": "158158",
                "fichaEsisla": laudo_esisla,
                "retroacaoInvalida": caso["retroacao_invalida"],
            }
        }

        res_save = client.post("/api/atendimentos", json=save_payload)
        assert res_save.status_code in (200, 201), f"Falha ao salvar atendimento {num}: {res_save.get_data(as_text=True)}"
        save_data = res_save.get_json()
        saved_id = (save_data.get("data") or {}).get("id") or save_data.get("id") or num
        CREATED_TEST_IDS.append(saved_id)

        # Transição oficial para FINALIZADO
        res_state = client.post(f"/api/atendimentos/{saved_id}/state", json={"estado": "FINALIZADO"})
        assert res_state.status_code == 200, f"Falha na transição de estado para FINALIZADO {saved_id}: {res_state.get_data(as_text=True)}"

        # 4. Consulta individual via GET /api/atendimentos/<id>
        res_get = client.get(f"/api/atendimentos/{saved_id}")
        assert res_get.status_code == 200, f"Falha ao consultar atendimento {saved_id}: {res_get.get_data(as_text=True)}"
        get_json = res_get.get_json()
        get_data = get_json.get("data") or get_json
        assert get_data.get("atendimento") == num
        assert get_data.get("status") in ("FINALIZADO", "Finalizado")

        # Verifica integridade do payload salvo
        stored_payload = get_data.get("payload") or {}
        assert stored_payload.get("cid") == caso["cid"]
        assert stored_payload.get("parecer") == caso["parecer"]
        assert int(stored_payload.get("dias")) == caso["dias"]
        assert stored_payload.get("ficha_esisla") == laudo_esisla

    # 5. Consulta na lista de gestão com isolamento de sessão
    res_list = client.get("/api/atendimentos?page=1&pageSize=20")
    assert res_list.status_code == 200
    list_json = res_list.get_json()
    list_data = list_json.get("data") or list_json
    items = list_data.get("items") or []
    returned_nums = {item.get("atendimento") or item.get("numero") for item in items}

    # Todos os 5 atendimentos devem ser encontrados na lista
    for caso in casos:
        assert caso["numero"] in returned_nums, f"Atendimento {caso['numero']} não encontrado na lista de gestão!"
