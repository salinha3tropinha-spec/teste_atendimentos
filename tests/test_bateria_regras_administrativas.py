"""
Bateria de Testes para Regras Administrativas e Armadilhas do DPME SP:
1. Retroação > 3 dias (Guia extemporânea, parecer CONTRÁRIO 0 dias, justificativa sem parênteses, quesitos Sim/Sim/Sim).
2. Servidor Readaptado com queixa na doença de base (parecer CONTRÁRIO 0 dias, quesitos Sim/Sim/Não, apto ao rol residual).
3. Acompanhamento Familiar / CID Z76.3 (parecer CONTRÁRIO 0 dias, Artigos 191/193 da Lei 10.261/68, quesitos Sim/Não/Não).
4. Perícia de Acompanhante oficial pelo Artigo 199.
5. Auditoria de eliminação de parênteses e duplicidade 'e e'.
"""

import pytest
import re
from app import (
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla,
    _aprimorar_justificativa_retroacao_esisla,
    _remover_parenteses_texto,
    _is_retroacao_invalida_payload,
    _clean_esisla_text,
    _minimal_ai_context,
)


def test_caso_1_retroacao_maior_que_3_dias_completo():
    """
    Caso 1: Servidor com lombociatalgia intensa (CID M54.4), atestado emitido em 15/01/2026,
    porém a Guia com mais de 3 dias de retroação foi expedida somente em 29/01/2026 (14 dias de retroação).
    Regras DPME SP:
    - Parecer: CONTRÁRIO
    - Nº Dias: 0
    - Quesitos médicos preservados como Sim, Sim, Sim (a incapacidade física existe, a glosa é administrativa)
    - Limitações funcionais clínicas reais preservadas (NÃO pode dizer 'sem limitações')
    - Justificativa técnica estrita, sem nenhum parêntese ()
    - Sem duplicidade 'e e'
    """
    payload = {
        "nome": "João dos Santos",
        "idade": "30",
        "sexo": "Masculino",
        "readaptado": "Não",
        "cargo": "Servidor Público Estadual",
        "doenca_motivo": "Lombociatalgia intensa",
        "cid": "M54.4",
        "sintomas_limitacoes": "dor em região lombar com piora recente e irradiação para o membro inferior direito acompanhada de dormência, apresentando marcha claudicante e limitação para flexão do tronco e",
        "data_documento": "2026-01-15",
        "data_expedicao": "2026-01-29",
        "retroacao_dias": 14,
        "retroacao_invalida": True,
        "dias_solicitados": 15,
        "medico_perito": "Dr. Maykon",
        "crm": "158158",
        "pressao_sistolica": "120",
        "pressao_diastolica": "80",
        "pulso": "80",
        "exame_fisico_descricao": "Ao exame físico, apresenta marcha claudicante, teste de Lasègue positivo a 45 graus à direita e limitação funcional severa para flexão do tronco e permanência em pé.",
        "alteracoes_clinicas_exames": "Não foram apresentados exames complementares (imagem ou laboratoriais) no ato pericial.",
        "fisioterapia": True,
        "fisioterapia_detalhes": "motora duas vezes por semana",
        "psicoterapia": False,
        "medicamentos": []
    }

    # 1. Verifica detecção de retroação inválida
    retro_flag, retro_dias, doc_br, exp_br = _is_retroacao_invalida_payload(payload)
    assert retro_flag is True
    assert retro_dias == 14
    assert doc_br == "15/01/2026"
    assert exp_br == "29/01/2026"

    # 2. Gera ficha determinística e-SISLA
    laudo = _build_deterministic_esisla(payload)

    # 3. Passa pelo gatekeeper anti-glosa
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    # 4. Asserções rigorosas
    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "CID 10: M54.4" in laudo_final

    # Quesitos devem ser Sim, Sim, Sim
    assert re.search(r"1\)\s*Há doença.*?\?\s*Sim", laudo_final, re.IGNORECASE)
    assert re.search(r"2\)\s*A\(s\) doença.*?\?\s*Sim", laudo_final, re.IGNORECASE)
    assert re.search(r"3\)\s*A\(s\) limitação.*?\?\s*Sim", laudo_final, re.IGNORECASE)

    # Limitação física clínica real deve estar presente (não 'sem limitações')
    assert "Rol de Atividades do cargo de Servidor Público Estadual" in laudo_final
    assert "Do ponto de vista médico não se observam limitações" not in laudo_final

    # Justificativa técnica deve conter o texto padrão DPME com datas e dias
    assert "Guia com mais de 3 dias de retroação foi expedida somente em 29/01/2026 para atestado emitido em 15/01/2026" in laudo_final
    assert "totalizando 14 dias de retroação" in laudo_final
    assert "ausência de comprovação documental de internação hospitalar" in laudo_final

    # REGRA DE OURO DPME: ZERO parênteses na justificativa!
    m_just = re.search(r"\(\*\)\s*Justificativa Parecer Médico:?\s*\n(.*?)\n\s*\(\*\)\s*Parecer Final", laudo_final, re.DOTALL)
    assert m_just is not None
    just_corpo = m_just.group(1).strip()
    assert "(" not in just_corpo, f"Parêntese '(' encontrado na justificativa: {just_corpo}"
    assert ")" not in just_corpo, f"Parêntese ')' encontrado na justificativa: {just_corpo}"

    # Sem duplicidade 'e e'
    assert " e e " not in laudo_final
    assert " e e," not in laudo_final


def test_caso_2_servidor_readaptado_queixa_doenca_base():
    """
    Caso 2: Servidora readaptada exercendo atividades de suporte pedagógico na secretaria,
    com queixa na mesma doença de base (lombociatalgia crônica).
    Ao exame pericial, demonstra adaptação funcional ao rol de sua readaptação.
    Regras DPME SP:
    - Parecer: CONTRÁRIO
    - Nº Dias: 0
    - Quesitos oficiais de Readaptação: 1) Sim, 2) Sim, 3) Não
      (Tem doença? Sim. Gera limitação? Sim. Impede o rol da readaptação? Não.)
    - Limitações: Encontra-se devidamente adaptada ao rol de atividades de sua readaptação funcional.
    - Justificativa: Capacidade laborativa própria preservada para as atribuições constantes no rol de atividades da readaptação funcional.
    """
    payload = {
        "nome": "Cláudia de Souza",
        "idade": "48",
        "sexo": "Feminino",
        "readaptado": "Sim",
        "atividades_readaptado": "atendimento ao público e digitação de prontuários em secretaria",
        "cargo": "Professor de Educação Básica II",
        "doenca_motivo": "Lombociatalgia crônica",
        "cid": "M54.4",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": 0,
        "medico_perito": "Dr. Maykon",
        "crm": "158158",
        "pressao_sistolica": "120",
        "pressao_diastolica": "80",
        "pulso": "76",
        "exame_fisico_descricao": "Coluna lombar com dor leve à palpação de paravertebrais, sem contratura aguda, Lasègue negativo bilateralmente, marcha normal sem claudicação.",
        "alteracoes_clinicas_exames": "Não foram apresentados exames complementares no ato pericial.",
        "fisioterapia": True,
        "fisioterapia_detalhes": "duas vezes por semana",
        "psicoterapia": False,
        "medicamentos": [{"nome": "Paracetamol", "dosagem": "750 mg", "frequencia": "se dor"}]
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "relatou ser readaptada, exercendo atualmente as atividades de atendimento ao público e digitação" in laudo_final

    # Quesitos de Readaptação: 1: Sim, 2: Sim, 3: Não
    assert re.search(r"1\)\s*Há doença.*?\?\s*Sim", laudo_final, re.IGNORECASE)
    assert re.search(r"2\)\s*A\(s\) doença.*?\?\s*Sim", laudo_final, re.IGNORECASE)
    assert re.search(r"3\)\s*A\(s\) limitação.*?\?\s*Não", laudo_final, re.IGNORECASE)

    # Limitações específicas de Readaptado
    assert "devidamente adaptada ao rol de atividades de sua readaptação funcional" in laudo_final
    assert "não se observando limitações incapacitantes para as atribuições de seu atual termo de readaptação funcional" in laudo_final

    # Justificativa oficial de Readaptado
    assert "Capacidade laborativa própria preservada para as atribuições constantes no rol de atividades da readaptação funcional" in laudo_final


def test_caso_3_acompanhamento_familiar_cid_z76_3_artigos_191_193():
    """
    Caso 3: Servidor público estadual que comparece com atestado médico sob CID Z76.3
    (pessoa em boa saúde acompanhando pessoa doente) pleiteando LTS.
    Regras DPME SP / Estatuto dos Funcionários Públicos (Lei 10.261/1968):
    - A LTS dos Artigos 191 e 193 é privativa para incapacidade do PRÓPRIO servidor.
    - O pleito de acompanhamento de familiar não se enquadra em LTS direta.
    - Parecer: CONTRÁRIO
    - Nº Dias: 0
    - Quesitos: 1) Sim, 2) Não, 3) Não (servidor hígido e apto ao trabalho)
    - Justificativa técnica: Menciona expressamente Artigos 191 e 193 da Lei Estadual nº 10.261/1968.
    """
    payload = {
        "nome": "Marcos Vinicius",
        "idade": "35",
        "sexo": "Masculino",
        "readaptado": "Não",
        "cargo": "Oficial Administrativo",
        "doenca_motivo": "Pessoa em boa saúde acompanhando pessoa doente",
        "cid": "Z76.3",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": 0,
        "medico_perito": "Dr. Maykon",
        "crm": "158158",
        "pressao_sistolica": "120",
        "pressao_diastolica": "80",
        "pulso": "72",
        "exame_fisico_descricao": "Periciado em bom estado geral, lúcido, orientado, afebril, sem queixas álgicas ou sinais de adoecimento próprio no momento do exame.",
        "alteracoes_clinicas_exames": "Apresenta relatório médico assistencial referente ao dependente internado.",
        "fisioterapia": False,
        "psicoterapia": False,
        "medicamentos": []
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "Z76.3" in laudo_final

    # Quesitos no Z76.3: 1: Sim, 2: Não, 3: Não
    assert re.search(r"1\)\s*Há doença.*?\?\s*Sim", laudo_final, re.IGNORECASE)
    assert re.search(r"2\)\s*A\(s\) doença.*?\?\s*Não", laudo_final, re.IGNORECASE)
    assert re.search(r"3\)\s*A\(s\) limitação.*?\?\s*Não", laudo_final, re.IGNORECASE)

    # Justificativa oficial DPME com Artigos 191 e 193 da Lei Estadual 10.261/1968
    assert "Capacidade laborativa própria preservada" in laudo_final
    assert "Artigos 191 e 193 da Lei Estadual nº 10.261/1968" in laudo_final

    # Limitações: não se observam limitações físicas ou mentais funcionais
    assert "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Oficial Administrativo" in laudo_final


def test_remover_parenteses_e_limpeza_de_duplo_e():
    """
    Verifica que _remover_parenteses_texto e _aprimorar_justificativa_retroacao_esisla
    removem sistematicamente parênteses e limpam 'e e'.
    """
    texto_com_parenteses = (
        "Embora o(a) servidor(a) apresente lombociatalgia (CID M54.4) com dor e e limitações "
        "com relato de relata dor (14 dias de retroação), constata-se a extemporaneidade."
    )
    limpo = _remover_parenteses_texto(texto_com_parenteses)
    assert "(" not in limpo
    assert ")" not in limpo
    assert " e e " not in limpo
    assert ", sob CID M54.4," in limpo
    assert ", totalizando 14 dias de retroação," in limpo
    assert "com relato de relata" not in limpo
    assert "com relato de dor" in limpo


def test_minimal_ai_context_quesitos_invalida_retroacao():
    """
    Garante que _minimal_ai_context fornece q1: Sim, q2: Sim, q3: Sim
    quando a retroação é inválida, para orientar adequadamente o prompt da IA.
    """
    payload = {
        "parecer": "CONTRÁRIO",
        "data_documento": "2026-01-10",
        "data_expedicao": "2026-01-25",
        "retroacao_invalida": True,
        "retroacao_dias": 15,
        "cargo": "Professor"
    }
    ctx = _minimal_ai_context(payload)
    quesitos = ctx["quesitos"]
    assert len(quesitos) == 3
    assert quesitos[0]["resposta"] == "Sim"
    assert quesitos[1]["resposta"] == "Sim"
    assert quesitos[2]["resposta"] == "Sim"
