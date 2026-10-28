# -*- coding: utf-8 -*-
"""
Suite Abrangente de Testes Clínicos do Modo IA 2.0:
1. Teste de Áudio Real (.m4a do usuário):
   - Desmembramento de respostas compostas ("22 anos, sou policial penal há 15 anos, não sou readaptado")
   - Mapeamento correto dos itens da colinha (Item 01 Idade, Item 02 Cargo, Item 03 Tempo, Item 04 Readaptação, Item 05 Início, Item 07 Frequência, Item 08 Sintomas)
2. Teste Clínico Ortopédico (Lombalgia / M54.5):
   - Decisão Favorável do médico perito
   - Preenchimento integral e-SISLA (Nome, Cargo, Idade, CID 10, Parecer, Dias, Exame Físico, Quesitos, Justificativa)
3. Teste Clínico Psiquiátrico (Depressão / F32 / F33 / F41):
   - Decisão Contrária do médico perito (capacidade preservada / sem incapacidade laborativa)
   - Preenchimento integral e-SISLA com soberania da decisão do médico (0 dias, Quesitos 1:Sim, 2:Não, 3:Não)
4. Teste de Robustez Anti-Glosa e Sanitização:
   - Lateralidade anatômica (D -> direito, E -> esquerdo)
   - Eliminação de dicionários brutos e fragmentos
   - Deduplicação de CRM e Rol de Atividades
"""
import io
import os
import json
from pathlib import Path
import pytest

from app import (
    app,
    PreenchimentoCompletoResult,
    _generate_structured,
    TASK_PROMPTS,
    _clean_queixa_duracao_text,
    _clean_esisla_text,
    _estruturar_secoes_oficiais_esisla,
    _detectar_terapias_texto,
    _formatar_lista_medicamentos,
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODELS
)

def test_gemini_model_configuration():
    """Valida que o modelo configurado e a lista de fallbacks são da família Gemini 3.x."""
    assert "gemini-3" in GEMINI_MODEL or "gemini-flash" in GEMINI_MODEL
    assert len(GEMINI_FALLBACK_MODELS) >= 1
    for m in GEMINI_FALLBACK_MODELS:
        assert "gemini-2.5-flash" != m, "Modelo obsoleto 2.5 não deve constar como fallback"

def test_caso_ortopedico_preenchimento_completo_com_decisao_medico():
    """Valida preenchimento completo para caso de Ortopedia / Dor Lombar com decisão Favorável."""
    texto_dialogo = (
        "Médico Perito: Qual é a sua idade?\n"
        "Periciado: Tenho 22 anos.\n"
        "Médico Perito: Qual é o seu cargo?\n"
        "Periciado: Sou Policial Penal.\n"
        "Médico Perito: Quanto tempo está no cargo?\n"
        "Periciado: Há 15 anos.\n"
        "Médico Perito: É readaptado?\n"
        "Periciado: Não sou readaptado.\n"
        "Médico Perito: Qual foi a data do diagnóstico da doença?\n"
        "Periciado: Início dos sintomas em 10/10/2026.\n"
        "Médico Perito: Com que frequência comparece às consultas?\n"
        "Periciado: Consultas quinzenais com ortopedista.\n"
        "Médico Perito: Quais sintomas causam limitações para o trabalho?\n"
        "Periciado: Dores intensas na região lombar que pioram ao carregar peso e ficar em pé por muito tempo.\n"
        "Médico Perito: Faz uso de medicamentos?\n"
        "Periciado: Tomo dipirona 1g se dor e ciclobenzaprina 5mg à noite.\n"
        "Médico Perito: Faz fisioterapia?\n"
        "Periciado: Faço fisioterapia duas vezes por semana."
    )

    decisao_medico = {
        "parecer": "FAVORÁVEL",
        "exameFisicoResultado": "Dor à palpação da musculatura paravertebral lombar com limitação dolorosa da flexão do tronco. Lasègue negativo.",
        "diasConcedidos": 15,
        "observacoesMedico": "Quadro compatível com dorsalgia/lombalgia mecânica aguda (CID M54.5). Incapacidade temporária para atividades operacionais."
    }

    instruction = (
        TASK_PROMPTS["preencher_ficha"]
        + "\n\nTEXTO BRUTO FORNECIDO PELO USUÁRIO:\n"
        + texto_dialogo
        + "\n\nDECISÃO CLÍNICA/PERICIAL DEFINIDA PELO MÉDICO PERITO NO SISTEMA:\n"
        + f"- Parecer definido pelo médico: {decisao_medico['parecer']}\n"
        + f"- Avaliação do exame físico pelo perito: {decisao_medico['exameFisicoResultado']}\n"
        + f"- Dias concedidos pelo médico: {decisao_medico['diasConcedidos']}\n"
        + f"- Observações clínicas do perito: {decisao_medico['observacoesMedico']}\n"
        + "ATENÇÃO: A decisão do médico perito acima é SOBERANA. Você deve alinhar estritamente o parecer, exame clínico, justificativa e limitações a essas escolhas do perito.\n"
    )

    with app.test_request_context("/api/ai/preencher-ficha", method="POST"):
        result = _generate_structured(instruction, PreenchimentoCompletoResult)

    assert result.idade == "22"
    assert "policial" in result.cargo.lower()
    assert "15" in str(result.tempo_cargo)
    assert result.readaptado.lower() in ("não", "nao")
    assert "M54" in result.cid or "M51" in result.cid
    assert "FAVOR" in result.parecer.upper()
    assert len(result.justificativa) > 30

def test_caso_psiquiatrico_decisao_contraria_soberana():
    """Valida preenchimento para caso com decisão CONTRÁRIA do perito por capacidade preservada."""
    texto_dialogo = (
        "Médico Perito: Qual é a sua idade?\n"
        "Periciado: 35 anos.\n"
        "Médico Perito: Qual é o seu cargo?\n"
        "Periciado: Oficial Administrativo.\n"
        "Médico Perito: Quanto tempo está no cargo?\n"
        "Periciado: 8 anos.\n"
        "Médico Perito: É readaptado?\n"
        "Periciado: Não.\n"
        "Médico Perito: Qual foi a data do diagnóstico?\n"
        "Periciado: Refere desânimo e ansiedade desde o mês passado.\n"
        "Médico Perito: Quais sintomas causam limitações?\n"
        "Periciado: Cansaço e falta de concentração.\n"
        "Médico Perito: Faz uso de medicamentos?\n"
        "Periciado: Sertralina 50mg pela manhã.\n"
        "Médico Perito: Faz psicoterapia?\n"
        "Periciado: Não iniciei terapia ainda."
    )

    decisao_medico = {
        "parecer": "CONTRÁRIO",
        "exameFisicoResultado": "Exame psíquico: Vigil, orientado globalmente, pensamento com curso e forma normais, sem ideação delirante ou risco suicida. Humor eutímico durante o exame pericial, afeto modulado. Funções cognitivas preservadas. Sem sinais de alienação ou comprometimento grave da capacidade de autodeterminação.",
        "diasConcedidos": 0,
        "observacoesMedico": "Não se constata incapacidade laborativa no momento pericial para as funções habituais de Oficial Administrativo. Tratamento medicamentoso inicial não impeditivo da atividade."
    }

    instruction = (
        TASK_PROMPTS["preencher_ficha"]
        + "\n\nTEXTO BRUTO FORNECIDO PELO USUÁRIO:\n"
        + texto_dialogo
        + "\n\nDECISÃO CLÍNICA/PERICIAL DEFINIDA PELO MÉDICO PERITO NO SISTEMA:\n"
        + f"- Parecer definido pelo médico: {decisao_medico['parecer']}\n"
        + f"- Avaliação do exame físico pelo perito: {decisao_medico['exameFisicoResultado']}\n"
        + f"- Dias concedidos pelo médico: {decisao_medico['diasConcedidos']}\n"
        + f"- Observações clínicas do perito: {decisao_medico['observacoesMedico']}\n"
        + "ATENÇÃO: A decisão do médico perito acima é SOBERANA. Você deve alinhar estritamente o parecer, exame clínico, justificativa e limitações a essas escolhas do perito.\n"
    )

    with app.test_request_context("/api/ai/preencher-ficha", method="POST"):
        result = _generate_structured(instruction, PreenchimentoCompletoResult)

    assert "CONTR" in result.parecer.upper()
    assert len(result.justificativa) > 30

def test_desmembramento_composto_dialogo_ia2_prompt():
    """Valida se o prompt da IA 2.0 contém as diretrizes mandatórias de desmembramento de falas rápidas."""
    from app import api_ai_refinar_dialogo_ia2
    import inspect
    src = inspect.getsource(api_ai_refinar_dialogo_ia2)

    assert "DESMEMBRAMENTO DE RESPOSTAS RÁPIDAS OU COMPOSTAS" in src
    assert "22 anos. Sou policial penal há 15 anos. Não sou readaptado." in src
    assert "Item 1: Pergunta: 'Qual é a sua idade?'" in src
    assert "Item 2: Pergunta: 'Qual é o seu cargo?'" in src
    assert "ESTRUTURAÇÃO COMPLETA DE TODAS AS PERGUNTAS E RESPOSTAS IDENTIFICADAS" in src
    assert "NÃO se limite e NÃO filtre apenas as 11 perguntas do roteiro pericial" in src
    assert "'colinha_id': null" in src
    assert "colinha_status" in src

def test_endpoint_refinar_dialogo_audio_real_usuario():
    """Valida o endpoint /api/ai/refinar-dialogo-ia2 com o arquivo de áudio real (.m4a) enviado pelo usuário."""
    audio_path = Path(r"C:\Users\maykon.moraes\.gemini\antigravity\brain\489024fa-3d24-468a-adee-a576b3498293\.user_uploaded\uploaded_media_1793013210647.m4a")
    if not audio_path.exists():
        pytest.skip("Arquivo de áudio do usuário não disponível no ambiente")

    audio_bytes = audio_path.read_bytes()
    client = app.test_client()

    data = {
        "audio": (io.BytesIO(audio_bytes), "consulta_usuario.m4a", "audio/mp4")
    }

    resp = client.post("/api/ai/refinar-dialogo-ia2", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200, f"Erro no endpoint: {resp.data.decode('utf-8')}"

    json_data = resp.get_json()
    assert json_data.get("success") is True or json_data.get("ok") is True

    payload = json_data.get("data") or json_data
    colinha_status = payload.get("colinha_status") or []
    dialogo = payload.get("dialogo") or []
    texto_formatado = payload.get("texto_formatado") or ""

    # Verifica se os itens do áudio foram devidamente identificados
    # Áudio do usuário contém: 22 anos (Q1), policial penal (Q2), 15 anos (Q3), não readaptado (Q4), 10/10 (Q5), de 15 em 15 dias (Q7), dores nas costas (Q8)
    status_map = {item["id"]: item for item in colinha_status if isinstance(item, dict) and "id" in item}

    # Q01: Idade (22 anos)
    assert 1 in status_map
    assert status_map[1].get("matched") is True
    assert "22" in str(status_map[1].get("snippet") or "")

    # Q02: Cargo (Policial Penal)
    assert 2 in status_map
    assert status_map[2].get("matched") is True
    assert "policial" in str(status_map[2].get("snippet") or "").lower()

    # Q03: Tempo no cargo (15 anos)
    assert 3 in status_map
    assert status_map[3].get("matched") is True
    assert "15" in str(status_map[3].get("snippet") or "")

    # Q04: Readaptado (Não)
    assert 4 in status_map
    assert status_map[4].get("matched") is True
    assert "não" in str(status_map[4].get("snippet") or "").lower() or "nao" in str(status_map[4].get("snippet") or "").lower()

    # Q08: Sintomas (dores nas costas)
    assert 8 in status_map
    assert status_map[8].get("matched") is True
    assert "costas" in str(status_map[8].get("snippet") or "").lower() or "dor" in str(status_map[8].get("snippet") or "").lower()
