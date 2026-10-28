# -*- coding: utf-8 -*-
"""
Bateria de Testes com 8 Atendimentos Reais Baseados em Texto Bruto "Sujo" de Peritos:
Abreviações médicas típicas (MID, MSE, BEG, MV+, LOMBO, DIP 1G SN, fst, pst, etc.),
cobrindo casos FAVORÁVEIS e CONTRÁRIOS de:
- Ortopedia (Casos 1, 2 e 7)
- Reumatologia (Casos 3, 4 e 8)
- Neurologia (Casos 5 e 6)
"""
import pytest
from app import (
    app,
    _expandir_abreviacoes_medicas_texto,
    _sanitizar_texto_portugues_esisla,
    _clean_queixa_duracao_text,
    _clean_esisla_text,
    _estruturar_secoes_oficiais_esisla,
    _detectar_terapias_texto,
    _build_deterministic_esisla,
    _gatekeeper_anti_glosa_esisla,
    parse_esisla_text,
    PreenchimentoCompletoResult
)

def test_abreviacoes_medicas_expansao():
    """Valida se a expansão de abreviações e jargões converte todos os termos-chave."""
    raw = "svd 44a peb 2 ha 14a no estado qx lombo intensa irradiando p mid c dormencia pe d. ef: beg lote mv+ s/ra. tto c dip 1g sn vo, faz fst 2x sem nega pst."
    expanded = _expandir_abreviacoes_medicas_texto(raw)
    
    assert "servidor" in expanded.lower()
    assert "Professor de Educação Básica II" in expanded
    assert "há 14 anos" in expanded
    assert "lombociatalgia" in expanded.lower()
    assert "membro inferior direito" in expanded
    assert "bom estado geral" in expanded
    assert "murmúrio vesicular presente bilateralmente" in expanded
    assert "Dipirona 1 g se dor" in expanded
    assert "fisioterapia" in expanded
    assert "psicoterapia" in expanded


def test_caso_1_ortopedia_favoravel_lombociatalgia_radiculopatia_mid():
    """Caso 1: Ortopedia FAVORÁVEL (Lombociatalgia aguda incapacitante com radiculopatia à direita)."""
    raw_texto = (
        "svd 44a peb 2 ha 14a no estado nao readaptada qx lombo intensa irradiando p mid c dormencia pe d "
        "desde 10/01/26 piora ha 15d ao fletir tronco e ortostase. tto ortop cons mensais. faz fst 2x sem nega pst. "
        "uso pregabalina 75mg noite e dip 1g sn vo. ef: beg lote lasegue + 45g a d marcha claudicante lim func lombar severa. "
        "atest dr carlos crm 123456 de 20/01/26 concede 30d guia exp 22/01/26. favoravel 30d m54.4"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    fisio, psico = _detectar_terapias_texto(expanded)
    assert fisio is True
    assert psico is False

    payload = {
        "nome_paciente": "MARIA APARECIDA DA SILVA",
        "idade": "44",
        "sexo": "Feminino",
        "cargo": "Professor de Educação Básica II",
        "tempo_cargo": "14",
        "readaptado": "Não",
        "cid": "M54.4",
        "cid_descricao": "Lombociatalgia com radiculopatia",
        "doenca_motivo": "Lombociatalgia intensa",
        "sintomas_limitacoes": "Dor lombar intensa com irradiação para membro inferior direito e dormência",
        "fisioterapia": fisio,
        "psicoterapia": psico,
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "30",
        "data_documento": "20/01/2026",
        "data_expedicao": "22/01/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, lúcido e orientado no tempo e espaço. Coluna lombar com teste de Lasègue positivo a 45 graus à direita, marcha claudicante e limitação funcional severa.",
        "desc_limitacao": "Apresenta limitações físicas temporárias decorrentes de lombociatalgia com irradiação para membro inferior direito, inviabilizando postura ortostática prolongada e flexão do tronco, atividades constantes no Rol de Atividades do cargo de Professor de Educação Básica II.",
        "justificativa": "Considero a capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol do cargo de Professor de Educação Básica II, em razão de limitações físicas decorrentes de lombociatalgia aguda, CID M54.4, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: FAVORÁVEL" in laudo_final
    assert "Nº Dias: 30" in laudo_final
    assert "CID 10: M54.4" in laudo_final
    assert "membro inferior direito" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final


def test_caso_2_ortopedia_contrario_lombalgia_mecanica_leve():
    """Caso 2: Ortopedia CONTRÁRIO (Lombalgia mecânica resolvida, capacidade laborativa preservada)."""
    raw_texto = (
        "servidor 35 anos adm ha 6a n readaptado queixa dor lombar apos pegar peso ha 8 dias agora assintomatico "
        "fez uso de profenid 2d sem medicacao atual nega fst e pst ef beg eupneico coluna lombar indolor sem contratura "
        "muscular lasegue negativo mmii livres forca grau 5 parecer contrario 0 dias m54.5"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    fisio, psico = _detectar_terapias_texto(expanded)
    assert fisio is False
    assert psico is False

    payload = {
        "nome_paciente": "JOAO ROBERTO SOUZA",
        "idade": "35",
        "sexo": "Masculino",
        "cargo": "Oficial Administrativo",
        "tempo_cargo": "6",
        "readaptado": "Não",
        "cid": "M54.5",
        "cid_descricao": "Dor lombar baixa",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "26/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, eupneico e consciente. Coluna lombar indolor, sem contratura paravertebral, Lasègue negativo e membros inferiores livres com força grau cinco preservada.",
        "desc_limitacao": "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Oficial Administrativo, constantes no rol de atividades.",
        "justificativa": "Capacidade laborativa própria preservada, considerando que neste ato pericial não se observam alterações ou limitações osteomusculares incapacitantes para as atribuições do cargo de Oficial Administrativo, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_final
    assert "Capacidade laborativa própria preservada" in laudo_final


def test_caso_3_reumatologia_favoravel_artrite_reumatoide_crise():
    """Caso 3: Reumatologia FAVORÁVEL (Artrite Reumatóide em crise poliarticular e sinovite ativa em punhos)."""
    raw_texto = (
        "servidora 51 anos oficial administrativo ha 22 anos nao readaptada portadora de artrite reumatoide "
        "soropositiva desde 2018 em acompanhamento reumatologico quinzenal refere dor e edema importante em punhos "
        "e articulacoes metacarpofalangicas msd e mse rigidez matinal superior a 2 horas com perda de forca de preensao "
        "inviabilizando digitacao e tarefas manuais uso de metotrexato 15mg semana leflunomida 20mg dia e prednisona 10mg dia "
        "nega fst ef beg regular articulacoes bilaterais com sinovite ativa e calor local atestado reumatologista emitido 15/02/2026 pedindo 45 dias m05.8 parecer favoravel 45 dias"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    assert "membro superior direito" in expanded
    assert "membro superior esquerdo" in expanded

    payload = {
        "nome_paciente": "TEREZA CRISTINA FAGUNDES",
        "idade": "51",
        "sexo": "Feminino",
        "cargo": "Oficial Administrativo",
        "tempo_cargo": "22",
        "readaptado": "Não",
        "cid": "M05.8",
        "cid_descricao": "Outras artrites reumatoides soropositivas",
        "doenca_motivo": "Artrite reumatoide soropositiva em crise poliarticular",
        "sintomas_limitacoes": "Dor, edema e calor em punhos e articulações metacarpofalângicas em membros superiores com rigidez matinal",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "45",
        "data_documento": "15/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral. Aparelho osteomuscular com sinovite ativa, calor local e edema em punhos e articulações metacarpofalângicas de membros superiores, com redução expressiva da força de preensão palmar bilateral.",
        "desc_limitacao": "Apresenta limitações físicas temporárias decorrentes de sinovite ativa em punhos, inviabilizando digitação contínua, redação e manuseio de processos, atividades constantes no Rol de Atividades do cargo de Oficial Administrativo.",
        "justificativa": "Considero a capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol do cargo de Oficial Administrativo, em razão de limitações físicas decorrentes de crise álgica de artrite reumatoide, CID M05.8, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: FAVORÁVEL" in laudo_final
    assert "Nº Dias: 45" in laudo_final
    assert "CID 10: M05.8" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final


def test_caso_4_reumatologia_contrario_fibromialgia_compensada():
    """Caso 4: Reumatologia CONTRÁRIO (Fibromialgia compensada, sem perda de amplitude ou força)."""
    raw_texto = (
        "svd 48a agente de organizacao escolar ha 12a n readaptada relata fibromialgia desde 2021 refere mialgia "
        "difusa e cansaco porem sem limitacao funcional para as tarefas do cargo em uso de duloxetina 30mg dia "
        "faz hidroginastica ef beg corada afebril osteomuscular sem sinovite amplitude articular normal sem pontos de "
        "gatilho ativos marcha preservada capacidade laborativa preservada parecer contrario 0 dias m79.7"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    payload = {
        "nome_paciente": "LILIAN REGINA DIAS",
        "idade": "48",
        "sexo": "Feminino",
        "cargo": "Agente de Organização Escolar",
        "tempo_cargo": "12",
        "readaptado": "Não",
        "cid": "M79.7",
        "cid_descricao": "Fibromialgia",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "10/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, corada, afebril. Aparelho osteomuscular com amplitude articular de grandes e pequenas articulações completamente preservadas, ausência de sinovite ou pontos de gatilho ativos e marcha livre.",
        "desc_limitacao": "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Agente de Organização Escolar, constantes no rol de atividades.",
        "justificativa": "Capacidade laborativa própria preservada, considerando a ausência de alterações funcionais incapacitantes no exame físico pericial para as atribuições do cargo de Agente de Organização Escolar, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_final


def test_caso_5_neurologia_favoravel_cervicobraquialgia_paresia_mse():
    """Caso 5: Neurologia FAVORÁVEL (Cervicobraquialgia com radiculopatia C7/C8 e perda de força em MSE)."""
    raw_texto = (
        "servidor 40 anos policial penal ha 10 anos nao readaptado com queixa de cervico intensa irradiada para mse "
        "acompanhada de perda de forca e parestesia em quarto e quinto quirodactilos da mao esquerda iniciada ha 20 dias "
        "com piora progressiva tto c neurocirurgiao em uso de gabapentina 300mg 8/8h e tramadol 50mg vo ef beg paresia em mse "
        "forca grau 4 reflexo tricipital diminuido hipoestesia em c7 c8 a esquerda atestado 18/02/2026 pede 30 dias guia 19/02/2026 parecer favoravel m50.1"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    assert "cervicobraquialgia" in expanded
    assert "membro superior esquerdo" in expanded

    payload = {
        "nome_paciente": "FERNANDO HENRIQUE ALMEIDA",
        "idade": "40",
        "sexo": "Masculino",
        "cargo": "Policial Penal",
        "tempo_cargo": "10",
        "readaptado": "Não",
        "cid": "M50.1",
        "cid_descricao": "Transtorno de disco cervical com radiculopatia",
        "doenca_motivo": "Cervicobraquialgia intensa com radiculopatia",
        "sintomas_limitacoes": "Dor cervical com irradiação para membro superior esquerdo, parestesia e perda de força manual",
        "parecer": "FAVORÁVEL",
        "dias_solicitados": "30",
        "data_documento": "18/02/2026",
        "data_expedicao": "19/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral. Exame neurológico evidenciando paresia em membro superior esquerdo com força muscular grau quatro, hiporreflexia tricipital e hipoestesia em dermátomos C7 e C8 à esquerda.",
        "desc_limitacao": "Apresenta limitações físicas temporárias decorrentes de radiculopatia cervical, inviabilizando manuseio de armamento, intervenção tática e contenção física, atividades constantes no Rol de Atividades do cargo de Policial Penal.",
        "justificativa": "Considero a capacidade laborativa parcial e temporariamente prejudicada considerando as atribuições do rol do cargo de Policial Penal, em razão de limitações físicas e neurológicas decorrentes de radiculopatia cervical sob CID M50.1, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: FAVORÁVEL" in laudo_final
    assert "Nº Dias: 30" in laudo_final
    assert "CID 10: M50.1" in laudo_final
    assert "membro superior esquerdo" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final


def test_caso_6_neurologia_contrario_cefaleia_resolvida():
    """Caso 6: Neurologia CONTRÁRIO (Cefaleia tensional episódica já resolvida, sem déficits)."""
    raw_texto = (
        "svd 29a analista sociocultural ha 3a nao readaptada teve cefaleia tensional ha 5 dias apos situacao "
        "de estresse episodio unico ja resolvido nega novas crises sem medicacao no momento ef beg loc nistagmo "
        "ausente pares cranianos preservados equilibrio dinamico normal romberg negativo sem rigidez de nuca "
        "exame neurologico normal apta ao trabalho parecer contrario 0 dias g44.2"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    payload = {
        "nome_paciente": "JULIANA COSTA BEZERRA",
        "idade": "29",
        "sexo": "Feminino",
        "cargo": "Analista Sociocultural",
        "tempo_cargo": "3",
        "readaptado": "Não",
        "cid": "G44.2",
        "cid_descricao": "Cefaleia tensional",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "12/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, lúcida, orientada e coerente. Pares cranianos preservados, teste de Romberg negativo, ausência de sinais meníngeos ou nistagmo, com exame neurológico inteiramente normal.",
        "desc_limitacao": "Do ponto de vista médico não se observam limitações físicas ou mentais funcionais incapacitantes para as atribuições do cargo de Analista Sociocultural, constantes no rol de atividades.",
        "justificativa": "Capacidade laborativa própria preservada, considerando o exame neurológico sem déficits e a remissão do quadro álgico para as atribuições habituais do cargo, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Não" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_final


def test_caso_7_ortopedia_retroacao_extemporanea_entorse_joelho():
    """Caso 7: Ortopedia CONTRÁRIO por RETROAÇÃO > 3 DIAS (Entorse de joelho com guia expedida 18 dias após)."""
    from app import _construir_justificativa_retroacao

    raw_texto = (
        "servidor 45a peb 1 ha 18a nao readaptado entorse de joelho direito com lesao meniscal m23.2 em 02/01/2026 "
        "dor ao apoiar mmii e claudicacao atestado dr roberto emitido em 02/01/2026 solicitando 21 dias guia expedida "
        "somente em 20/01/2026 retroacao de 18 dias sem comprovacao de internacao ef beg edema em joelho d dor a palpacao "
        "de interlinha articular e mckinney positivo parecer contrario por retroacao extemporanea"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    assert "membros inferiores" in expanded
    assert "Professor de Educação Básica I" in expanded

    just = _construir_justificativa_retroacao(
        cargo="Professor de Educação Básica I",
        cid="M23.2",
        doenca_motivo="Transtorno de menisco por ruptura ou lesão antiga",
        sintomas="dor ao apoiar membros inferiores, edema em joelho direito e claudicação",
        retro_dias=18,
        doc_date_br="02/01/2026",
        exp_date_br="20/01/2026"
    )
    assert "(" not in just and ")" not in just
    assert " e e " not in just

    payload = {
        "nome_paciente": "MARCOS AURELIO PRADO",
        "idade": "45",
        "sexo": "Masculino",
        "cargo": "Professor de Educação Básica I",
        "tempo_cargo": "18",
        "readaptado": "Não",
        "cid": "M23.2",
        "cid_descricao": "Transtorno de menisco",
        "doenca_motivo": "Lesão meniscal em joelho direito",
        "sintomas_limitacoes": "Dor ao apoio plantar e deambulação, edema articular em joelho direito",
        "parecer": "CONTRÁRIO",
        "retroacao_invalida": True,
        "retroacao_dias": 18,
        "dias_solicitados": "0",
        "data_documento": "02/01/2026",
        "data_expedicao": "20/01/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral. Joelho direito com edema moderado, dor à palpação de interlinha articular e manobras meniscais positivas, determinando marcha claudicante.",
        "desc_limitacao": "Apresenta limitações físicas temporárias para deambulação prolongada, permanência em pé e deslocamento com alunos, atividades constantes no Rol de Atividades do cargo de Professor de Educação Básica I.",
        "justificativa": just
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    assert "18 dias de retroação" in laudo_final
    assert "(" not in laudo_final.split("(*) Justificativa Parecer Médico")[1].split("(*) Parecer Final")[0]
    # Na retroação inválida os quesitos devem ser blindados em Sim, Sim, Sim
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Sim" in laudo_final


def test_caso_8_reumatologia_readaptada_gonartrose_estavel():
    """Caso 8: Reumatologia CONTRÁRIO em SERVIDORA READAPTADA (Gonartrose sem incapacidade para o termo)."""
    raw_texto = (
        "servidora 54 anos professora readaptada ha 4 anos exercendo funcoes de mediacao pedagogica e apoio a secretaria "
        "sem regencia de classe queixa de gonalgia cronica bilateral por gonartrose m17.0 estavel relata que as dores sao habituais "
        "e consegue exercer as atividades da sua readaptacao em uso de glucosamina e condroitina nega piora recente "
        "ef beg marcha sem auxilio amplitude articular de joelhos preservada apta para as atribuicoes do rol de readaptacao parecer contrario 0 dias"
    )

    expanded = _expandir_abreviacoes_medicas_texto(raw_texto)
    payload = {
        "nome_paciente": "CLAUDIA HELENA RAMOS",
        "idade": "54",
        "sexo": "Feminino",
        "cargo": "Professor de Educação Básica II",
        "tempo_cargo": "25",
        "readaptado": "Sim",
        "atividades_readaptado": "Mediação pedagógica e suporte à secretaria escolar, sem regência de classe",
        "cid": "M17.0",
        "cid_descricao": "Gonartrose primária bilateral",
        "parecer": "CONTRÁRIO",
        "dias_solicitados": "0",
        "data_documento": "18/02/2026",
        "medico_perito": "Dr. Maykon",
        "crm_responsavel": "158158",
        "exame_fisico_geral": "Bom estado geral, eupneica. Joelhos com crepitação bilateral fina, sem derrame articular ou calor local, amplitude preservada e marcha independente sem auxílio ortésico.",
        "desc_limitacao": "Apresenta limitações físicas funcionais parciais decorrentes de sua patologia de base, encontrando-se devidamente adaptada ao rol de atividades de sua readaptação funcional, não se observando limitações incapacitantes para as atribuições de seu atual termo de readaptação funcional.",
        "justificativa": "Capacidade laborativa própria preservada para as atribuições constantes no rol de atividades da readaptação funcional, referente ao período pleiteado."
    }

    laudo = _build_deterministic_esisla(payload)
    laudo_final = _gatekeeper_anti_glosa_esisla(laudo, payload)

    assert "Parecer: CONTRÁRIO" in laudo_final
    assert "Nº Dias: 0" in laudo_final
    # Quesitos oficiais em readaptado com capacidade preservada para o termo: Sim, Sim, Não
    assert "1) Há doença(s) ou sequela(s) de doença(s) prévia(s)? Sim" in laudo_final
    assert "2) A(s) doença(s) ou sequela(s) de doença(s) prévia(s) gera(m) limitação(ões) para periciando(a)? Sim" in laudo_final
    assert "3) A(s) limitação(ões) impede(m) o(a) periciando(a) de exercer alguma atividade do rol? Não" in laudo_final
    assert "termo de readaptação funcional" in laudo_final
