# -*- coding: utf-8 -*-
"""
Bateria de Testes Extremos: Saúde Mental e Oncologia
1. Servidor com depressão grave e polifarmácia (4+ medicações com mg/dia) e ajuste recente de dose
   -> Garantia de supressão da frase de dosagem inalterada e formatação limpa das 4 drogas.
2. Servidor com queixa de ansiedade (CID F41), porém com exame psíquico pericial preservado
   -> Parecer CONTRÁRIO 0 dias, Quesitos 1: Sim, 2: Não, 3: Não e justificativa de capacidade preservada.
3. Paciente oncológico em quimioterapia / imunoterapia (infusões)
   -> Garantia absoluta de que o sistema JAMAIS insere "Negou uso de medicações."
"""
import pytest
from app import (
    app,
    _formatar_lista_medicamentos,
    _clean_queixa_duracao_text,
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla
)


def test_cenario_1_saude_mental_polifarmacia_e_ajuste_recente():
    """Cenário 1: Depressão grave e polifarmácia (4 medicações) com ajuste recente de dosagem.
    - Venlafaxina 150 mg/dia, Quetiapina 100 mg/dia, Clonazepam 2 mg/dia se crise, Bupropiona 150 mg/dia.
    - Psiquiatra aumentou a dose da Quetiapina e introduziu Bupropiona recentemente.
    - Frase 'Não relatou troca de medicação ou alteração de dosagem' DEVE ser suprimida.
    """
    raw_meds = [
        {"medicamento": "Venlafaxina", "dosagem": "150 mg/dia", "frequência": "pela manhã", "observação": "antidepressivo"},
        {"medicamento": "Quetiapina", "dosagem": "100 mg/dia", "frequência": "ao deitar", "observação": "estabilizador e sono"},
        {"medicamento": "Clonazepam", "dosagem": "2 mg/dia", "frequência": "se crise de pânico", "observação": "ansiolítico"},
        {"medicamento": "Bupropiona", "dosagem": "150 mg/dia", "frequência": "pela manhã", "observação": "adjuvante dopaminérgico"}
    ]

    med_formatado = _formatar_lista_medicamentos(raw_meds)
    assert "Venlafaxina 150 mg/dia" in med_formatado
    assert "Quetiapina 100 mg/dia" in med_formatado
    assert "Clonazepam 2 mg/dia" in med_formatado
    assert "Bupropiona 150 mg/dia" in med_formatado
    assert "{" not in med_formatado and "}" not in med_formatado

    payload = {
        "nome_paciente": "MARIA REGINA SILVA",
        "idade": "49",
        "sexo": "Feminino",
        "cargo": "Professor de Educação Básica II",
        "tempo_cargo": "20",
        "readaptado": "Não",
        "cid": "F33.2",
        "cid_descricao": "Transtorno depressivo recorrente, episódio atual grave sem sintomas psicóticos",
        "doenca_motivo": "Episódio depressivo grave com ideação de ruína e choro imotivado",
        "sintomas_limitacoes": "Humor gravemente deprimido, anedonia, hipoprosexia e lentificação psicomotora, com aumento recente de dose da Quetiapina e introdução de Bupropiona pelo psiquiatra em 05/02/2026",
        "medications": raw_meds,
        "fisioterapia": False,
        "psicoterapia": True,
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "60",
        "data_documento": "05/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Estado geral regular. Exame psíquico evidenciando humor francamente hipotímico, afeto hipomodulado, lentificação psicomotora acentuada, hipoprosexia e choro imotivado durante a entrevista, sem delírios.",
        "desc_limitacao": "Apresenta limitações psíquicas temporárias decorrentes de depressão grave refratária, inviabilizando a regência de classe, o relacionamento pedagógico e atividades cognitivas de alta demanda, constantes no Rol de Atividades do cargo de Professor de Educação Básica II.",
        "justificativa": "Considero a capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol do cargo de Professor de Educação Básica II, em razão de limitações psíquicas decorrentes de episódio depressivo grave sob CID F33.2, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    # Verificações obrigatórias
    assert "Parecer: FAVORÁVEL" in laudo_final
    assert "Nº Dias: 60" in laudo_final
    assert "CID 10: F33.2" in laudo_final
    assert "Venlafaxina" in laudo_final
    assert "Quetiapina" in laudo_final
    assert "Bupropiona" in laudo_final
    assert "Clonazepam" in laudo_final
    # O fallback 'Não relatou troca de medicação ou alteração de dosagem' DEVE ter sido suprimido
    assert "Não relatou troca de medicação ou alteração de dosagem" not in laudo_final
    # Quesitos oficiais de favorável
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final


def test_cenario_2_ansiedade_exame_psiquico_preservado_contrario():
    """Cenário 2: Servidor com queixas ansiosas (F41), porém exame psíquico pericial sem alterações.
    - Parecer CONTRÁRIO, 0 dias.
    - Quesitos oficiais 1: Sim, 2: Não, 3: Não.
    - Justificativa clara de capacidade laborativa preservada.
    """
    payload = {
        "nome_paciente": "LUCAS MARCONDES DE OLIVEIRA",
        "idade": "33",
        "sexo": "Masculino",
        "cargo": "Oficial Administrativo",
        "tempo_cargo": "5",
        "readaptado": "Não",
        "cid": "F41.1",
        "cid_descricao": "Ansiedade generalizada",
        "doenca_motivo": "Sintomas ansiosos subjetivos situacionais",
        "sintomas_limitacoes": "Refere ansiedade e tensão em períodos de maior demanda de trabalho, porém sem descompensação psíquica ou comprometimento das funções executivas",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "12/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, consciente e orientado globalmente no tempo e espaço. Exame mental com humor eutímico, afeto congruente e bem modulado, pensamento com curso e conteúdo preservados, sem ideação delirante ou desespero, funções cognitivas e crítica inteiramente preservadas.",
        "desc_limitacao": "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Oficial Administrativo, constantes no rol de atividades.",
        "justificativa": "Capacidade laborativa própria preservada, considerando o exame do estado mental sem alterações cognitivas, volitivas ou afetivas incapacitantes para as atribuições rotineiras do cargo de Oficial Administrativo, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "CID 10: F41.1" in laudo_final
    assert "Capacidade laborativa própria preservada" in laudo_final
    # Quesitos oficiais em parecer contrário comum sem incapacidade
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_final


def test_cenario_3_oncologia_quimioterapia_imunoterapia_nunca_nega_medicacao():
    """Cenário 3: Servidora em tratamento oncológico (infusões de quimioterapia / imunoterapia).
    - Mesmo sem comprimidos contínuos, o sistema JAMAIS deve inserir 'Negou uso de medicações.'
    - Parecer FAVORÁVEL, 90 dias, Quesitos 1: Sim, 2: Sim, 3: Sim.
    """
    raw_queixa_onco = (
        "Servidora de 52 anos, relatou não ser readaptada, é Professora de Educação Básica II há 24 anos, com queixa de neoplasia maligna de mama em tratamento quimioterápico e imunoterapia com infusões quinzenais desde 2025, realizando consultas mensalmente com oncologista. "
        "A periciada refere fadiga importante, náuseas e mal-estar pós-infusão, apresentando limitação funcional severa para permanecer em pé e lecionar. "
        "Realiza fisioterapia motora uma vez por semana e acompanhamento psicológico quinzenal."
    )

    # 1. Limpeza de queixa não deve conter "Negou uso de medicações"
    cleaned_queixa = _clean_queixa_duracao_text(raw_queixa_onco)
    assert "Negou uso de medicações" not in cleaned_queixa
    assert "Não relatou uso de medicações" not in cleaned_queixa
    assert "sem uso de medicações" not in cleaned_queixa.lower()

    # 2. Geração determinística no e-SISLA sem lista de medicamentos em comprimido
    payload = {
        "nome_paciente": "SANDRA BEATRIZ NOGUEIRA",
        "idade": "52",
        "sexo": "Feminino",
        "cargo": "Professor de Educação Básica II",
        "tempo_cargo": "24",
        "readaptado": "Não",
        "cid": "C50.9",
        "cid_descricao": "Neoplasia maligna da mama, não especificada",
        "doenca_motivo": "Neoplasia maligna de mama em tratamento com quimioterapia e infusões de imunoterapia",
        "sintomas_limitacoes": "Fadiga intensa, fraqueza muscular generalizada e náuseas decorrentes das infusões quimioterápicas",
        "queixa_duracao": cleaned_queixa,
        "fisioterapia": True,
        "psicoterapia": True,
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "90",
        "data_documento": "01/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Estado geral regular, descorada uma cruz em quatro, eupneica. Cicatriz cirúrgica em mama esquerda de aspecto trófico e sem sinais flogísticos. Portadora de cateter totalmente implantado (Port-a-Cath) em hemitórax direito, pérvio e sem hiperemia. Hipodinâmica.",
        "desc_limitacao": "Apresenta limitações físicas temporárias decorrentes dos efeitos adversos do protocolo antineoplásico quimioterápico e imunoterápico, inviabilizando deambulação frequente, permanência em pé e imunossupressão para regência de classe, atividades constantes no Rol de Atividades do cargo de Professor de Educação Básica II.",
        "justificativa": "Considero a capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol do cargo de Professor de Educação Básica II, em razão de limitações físicas e imunológicas decorrentes de neoplasia maligna sob CID C50.9 em tratamento quimioterápico ativo, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    # Verificações oncológicas vitais
    assert "Parecer: FAVORÁVEL" in laudo_final
    assert "Nº Dias: 90" in laudo_final
    assert "CID 10: C50.9" in laudo_final
    assert "Negou uso de medicações" not in laudo_final
    assert "Não relatou uso de medicações" not in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final
