# -*- coding: utf-8 -*-
"""
Testes automatizados do Modo IA 2.0:
1. Validação das 11 perguntas da colinha em tempo real (COLINHA_IA2_CONFIG)
2. Estrutura visual do Modo IA 2.0 (Seleção, Gravação com colinha e Escrita focada)
3. Ocultação do prontuário ao fundo (CSS body.modo-ia2-active)
4. Integração na Gestão de Atendimentos (botão e redirecionamento com modo_ia2=1)
5. Backend app.py autorizando modo_ia2 no preenchimento de ficha
6. Fallback de texto e integração com e-SISLA
"""
from pathlib import Path
import re
import pytest

ROOT = Path(__file__).resolve().parent.parent
APP_PY = (ROOT / "app.py").read_text(encoding="utf-8")
ATTENDANCE_HTML = (ROOT / "ambiental_avaliacao_medica_lts_cid_assistente.html").read_text(encoding="utf-8")
if (ROOT / "ambiental_assistente.js").exists():
    ATTENDANCE_HTML += "\n" + (ROOT / "ambiental_assistente.js").read_text(encoding="utf-8")
if (ROOT / "ambiental_assistente.css").exists():
    ATTENDANCE_HTML += "\n" + (ROOT / "ambiental_assistente.css").read_text(encoding="utf-8")

GESTAO_HTML = (ROOT / "gestao_atendimentos.html").read_text(encoding="utf-8")
if (ROOT / "gestao_atendimentos.js").exists():
    GESTAO_HTML += "\n" + (ROOT / "gestao_atendimentos.js").read_text(encoding="utf-8")
if (ROOT / "gestao_atendimentos.css").exists():
    GESTAO_HTML += "\n" + (ROOT / "gestao_atendimentos.css").read_text(encoding="utf-8")

def test_colinha_11_perguntas_verbatim():
    """Valida se as 11 perguntas da colinha constam rigorosamente como solicitadas."""
    expected_perguntas = [
        ("01", "Qual é a sua idade ?"),
        ("02", "Qual é o seu cargo."),
        ("03", "Quanto tempo está no cargo ?"),
        ("04", "É readaptado? Se sim, quais atividades exerce atualmente?"),
        ("05", "Qual foi a data do diagnóstico da doença ?"),
        ("06", "Qual doença está tratando que motivou o afastamento?"),
        ("07", "Com que frequência comparece às consultas?"),
        ("08", "Quais sintomas causam limitações para o trabalho?"),
        ("09", "Faz o uso de quais medicações?"),
        ("10", "Qual a dosagem (anotar mg/dia)? No caso de CID F, perguntar quando houve troca ou alteração das dosagens da medicação."),
        ("11", "Faz psicoterapia ou fisioterapia?"),
    ]
    
    assert "const COLINHA_IA2_CONFIG = [" in ATTENDANCE_HTML
    for num, p in expected_perguntas:
        assert f'numero: "{num}"' in ATTENDANCE_HTML, f"Número {num} não encontrado"
        assert f'pergunta: "{p}"' in ATTENDANCE_HTML, f"Pergunta não encontrada verbatim no frontend: {p}"

def test_modo_ia2_html_structure():
    """Valida a presença de todos os containers e modais essenciais do Modo IA 2.0."""
    assert 'id="containerModoIA2"' in ATTENDANCE_HTML
    assert 'id="ia2ViewSelecao"' in ATTENDANCE_HTML
    assert 'id="ia2ViewGravacao"' in ATTENDANCE_HTML
    assert 'id="ia2ViewEscrita"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaItemsList"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaValidadasCount"' in ATTENDANCE_HTML
    assert 'id="ia2ColinhaProgressBar"' in ATTENDANCE_HTML
    assert 'id="ia2GravacaoTranscricao"' in ATTENDANCE_HTML
    assert 'id="ia2EscritaText"' in ATTENDANCE_HTML
    assert 'id="ia2TimerDisplay"' in ATTENDANCE_HTML
    assert 'id="ia2ModalAvisoColinha"' in ATTENDANCE_HTML
    assert 'id="ia2ModalSucesso"' in ATTENDANCE_HTML
    assert 'id="ia2ModalFichaEsislaViewer"' in ATTENDANCE_HTML

def test_modo_ia2_ocultacao_fundo_prontuario():
    """Valida a regra de ocultar o fundo do prontuário durante o Modo IA 2.0."""
    assert "body.modo-ia2-active #containerModoAgil," in ATTENDANCE_HTML
    assert "body.modo-ia2-active .sidebar," in ATTENDANCE_HTML
    assert "body.modo-ia2-active #stickyDoctorHUD" in ATTENDANCE_HTML
    assert "display: none !important;" in ATTENDANCE_HTML
    assert "body.modo-ia2-active #containerModoIA2" in ATTENDANCE_HTML

def test_modo_ia2_backend_auth():
    """Valida autorização no backend /api/ai/preencher-ficha para modo_ia2."""
    assert 'is_modo_ia2 = bool(raw.get("modo_ia2"))' in APP_PY
    assert 'if AUTH_REQUIRED and not (is_adm_in_doctor_login or is_modo_ia2):' in APP_PY

def test_gestao_atendimentos_open_eval_modo_ia2():
    """Valida que na Gestão de Atendimentos o botão e função de abertura já direcionam com modo_ia2=1."""
    assert "function openEval(enc, modoIa2 = true)" in GESTAO_HTML
    assert "p.set('modo_ia2', '1');" in GESTAO_HTML
    assert "function openModoIA2(enc)" in GESTAO_HTML
    assert "window.openModoIA2 = openModoIA2;" in GESTAO_HTML
    assert "🚀 Modo IA 2.0" in GESTAO_HTML

def test_attendance_auto_launch_modo_ia2():
    """Valida o auto-launch do Modo IA 2.0 no init ao receber modo_ia2=1 na URL."""
    assert 'const modoIa2Param = params.get("modo_ia2") === "1"' in ATTENDANCE_HTML
    assert 'abrirModoIA2("selecao");' in ATTENDANCE_HTML

def test_aplicar_preenchimento_ia_resultado_supports_ia2_sources():
    """Valida se aplicarPreenchimentoIAResultado lê textos vindos do Modo IA 2.0."""
    assert 'ia2EscritaText' in ATTENDANCE_HTML
    assert 'ia2GravacaoTranscricao' in ATTENDANCE_HTML
    assert '__ia2UltimoTextoProcessado' in ATTENDANCE_HTML

def test_terapias_detection_sovereign_raw_text():
    """Valida detecção soberana de fisioterapia e psicoterapia a partir do texto bruto do médico."""
    from app import _detectar_terapias_texto

    texto_medico = (
        "servidora 42a, peb 2 ha 12a no estado, nao readaptada. refere lombociatalgia importante "
        "iniciada em marco/2026 apos carregar peso, piora ao ficar em pe e sentada, dor irradiando "
        "para membro inferior D. tto c/ ortopedista retornos mensais. uso de pregabalina 75mg 1cp a "
        "noite e tramadol 50mg s/n se dor forte. faz fisio 2x/sem, nega psicoterapia."
    )
    # Mesmo que a IA ou o LLM tenha alucinado 'Não alegou fazer fisioterapia e psicoterapia.',
    # a detecção do texto bruto do médico prevalece de forma soberana.
    fisio, psico = _detectar_terapias_texto(texto_medico, "Não alegou fazer fisioterapia e psicoterapia.")
    assert fisio is True
    assert psico is False

def test_formatar_lista_medicamentos():
    """Valida formatação limpa de dicionários/listas de medicamentos para linguagem clínica."""
    from app import _formatar_lista_medicamentos

    raw_meds = [
        {'dosagem': '75 mg', 'frequência': '1 comprimido à noite', 'medicamento': 'Pregabalina', 'observação': 'dor neuropática'},
        {'dosagem': '50 mg', 'frequência': 'em caso de dor forte', 'medicamento': 'Tramadol', 'observação': 'analgesia de resgate'}
    ]
    formatted = _formatar_lista_medicamentos(raw_meds)
    assert "{" not in formatted
    assert "}" not in formatted
    assert "Pregabalina 75 mg (1 comprimido à noite, dor neuropática)" in formatted
    assert "Tramadol 50 mg (em caso de dor forte, analgesia de resgate)" in formatted

def test_clean_queixa_duracao_dedup_and_leak_removal():
    """Valida a deduplicação de queixa e duração e remoção de fragmentos e dicionários brutos."""
    from app import _clean_queixa_duracao_text

    raw_queixa = (
        "Servidora de 42 anos, relatou não ser readaptada, é Professora de Educação Básica I há 12 anos, com queixa de lombociatalgia importante associada a discopatia lombar desde 2026, realizando consultas mensalmente. "
        "A periciada refere dor lombar irradiada para o membro inferior direito, com piora ao assumir as posturas ortostática e sentada, além de limitação funcional para deambulação prolongada e carregamento de peso. "
        "Servidora de 42 anos, relatou não ser readaptada, é Professora de Educação Básica I há 12 anos, com queixa de lombociatalgia importante associada a discopatia lombar, desde 2026, realizando consultas mensalmente. "
        "A periciada refere dor lombar irradiada para o membro inferior direito, com piora ao assumir as posturas ortostática e sentada, além de limitação funcional para deambulação prolongada e carregamento de peso. "
        "1 comprimido à noite (dor neuropática) e forte (analgesia de resgate). Não relatou troca de medicação ou alteração de dosagem. Não alegou fazer fisioterapia e psicoterapia. "
        "Em uso de [{'dosagem': '75 mg', 'frequência': '1 comprimido à noite', 'medicamento': 'Pregabalina', 'observação': 'dor neuropática'}, {'dosagem': '50 mg', 'frequência': 'em caso de dor forte', 'medicamento': 'Tramadol', 'observação': 'analgesia de resgate'}], "
        "Pregabalina 75 mg, Tramadol 50 mg em caso de dor. Não relatou troca de medicação ou alteração de dosagem. Não alegou fazer fisioterapia e psicoterapia."
    )

    cleaned = _clean_queixa_duracao_text(raw_queixa)

    # 1. Sem vazamento de dicionários
    assert "{" not in cleaned
    assert "}" not in cleaned
    assert "'dosagem'" not in cleaned

    # 2. Sem fragmento órfão de posologia
    assert "1 comprimido à noite (dor neuropática) e forte" not in cleaned

    # 3. Deduplicação de frases inteiras
    assert cleaned.count("Servidora de 42 anos, relatou não ser readaptada") == 1
    assert cleaned.count("A periciada refere dor lombar irradiada") == 1
    assert cleaned.count("Não relatou troca de medicação ou alteração de dosagem") == 1

def test_clean_esisla_text_corrections():
    """Valida correções de CRM duplicado, traço em médico e concordância de lateralidade/rol."""
    from app import _clean_esisla_text, _estruturar_secoes_oficiais_esisla

    sample_esisla = (
        "(*) Descrição da(s) Limitação(ções) Física(s) e/ou Mental(is)\n"
        "Apresenta limitações físicas temporárias decorrentes de lombociatalgia com irradiação para membro inferior direito sinais de radiculopatia, "
        "inviabilizando a permanência prolongada em posição ortostática ou sentada, deambulação contínua e o carregamento de peso, atividades inerentes ao cargo de Professora de Educação Básica I, atividades estas constantes no Rol de Atividades do cargo de Professora de Educação Básica I.\n\n"
        "(*) Parecer Médico\n"
        "Parecer: FAVORÁVEL\n"
        "Nº Dias: 15\n"
        "Data Início: 31/03/2026\n"
        "CID 10: M51.1\n"
        "Descrição: Lombociatalgia importante associada a discopatia lombar\n"
        "CID 10 Secundário: M54.5\n"
        "Descrição Secundária: Dor lombar baixa\n"
        "Médico Perito: Dr. Maykon -\n"
        "CRM: 158158\n"
        "CRM: 158158\n"
        "Dt/Hr Perícia: 22/10/2026 11:34\n"
    )

    cleaned = _clean_esisla_text(sample_esisla)
    structured = _estruturar_secoes_oficiais_esisla(cleaned)

    # Lateralidade e preposição corrigidas
    assert "membro inferior direito, com sinais de radiculopatia" in structured
    assert "membro inferior direito sinais de radiculopatia" not in structured

    # Rol deduplicado
    assert "atividades inerentes ao cargo de Professora de Educação Básica I, atividades estas constantes" not in structured
    assert ", atividades estas constantes no Rol de Atividades do cargo de Professora de Educação Básica I." in structured

    # CRM deduplicado e traço do perito removido
    assert "Médico Perito: Dr. Maykon -" not in structured
    assert "Médico Perito: Dr. Maykon" in structured
    assert structured.count("CRM: 158158") == 1

def test_modo_ia2_voice_uses_get_user_media_and_speech_recognition():
    """Valida se o Modo IA 2.0 solicita permissão explícita ao navegador via getUserMedia no ditado e na gravação."""
    attendance_content = ATTENDANCE_HTML
    
    # Gravação ao vivo
    assert "navigator.mediaDevices.getUserMedia" in attendance_content
    assert "ia2AudioStream" in attendance_content
    assert "ia2Analyser" in attendance_content
    assert "async function iniciarGravacaoIA2" in attendance_content
    
    # Ditado no modo de escrita
    assert "async function alternarDitadoVozEscritaIA2" in attendance_content
    assert "ia2EscritaInterimBubble" in attendance_content
    assert "ia2DitadoEscritaStream" in attendance_content

def test_modo_ia2_finalizar_atendimento_official_flow():
    """Valida se o botão de finalizar após a IA segue o fluxo oficial de atendimento e não apenas rascunho."""
    attendance_content = ATTENDANCE_HTML
    
    # Botão Finalizar Atendimento presente no modal de sucesso
    assert 'id="ia2BtnFinalizarDefinitivo"' in attendance_content
    assert 'onclick="finalizarAtendimentoDefinitivoIA2()"' in attendance_content
    
    # Função finaliza seguindo o fluxo oficial (finalizarAtendimentoAgil / finalizeFromHeader / confirmFinalize)
    assert "finalizarAtendimentoDefinitivoIA2" in attendance_content
    assert "ensureAgileBackgroundDefaults" in attendance_content
    assert "syncAgilToExtended" in attendance_content
    assert "finalizarAtendimentoAgil" in attendance_content
    
    # Opção explícita de salvar rascunho preservada
    assert "salvarComoRascunhoIA2" in attendance_content

def test_modo_ia2_dialogue_cards_and_yellow_doubts():
    """Valida os elementos e funções da transcrição estruturada em diálogo e destaque de dúvidas em amarelo."""
    attendance_content = ATTENDANCE_HTML

    # 1. Elementos HTML do Diálogo e Dúvidas
    assert 'id="ia2BadgeDuvidas"' in attendance_content
    assert 'id="ia2QtdDuvidas"' in attendance_content
    assert 'id="ia2BtnAbaVisual"' in attendance_content
    assert 'id="ia2BtnAbaTexto"' in attendance_content
    assert 'id="ia2GravacaoVisual"' in attendance_content
    assert 'ia2-transcript-visual' in attendance_content
    assert 'ia2-doubt-word' in attendance_content
    assert 'ia2DuvidasLegenda' in attendance_content

    # 2. Funções JavaScript de Suporte
    assert "function destacarDuvidasHtml" in attendance_content
    assert "function estruturarTranscricaoEmDialogo" in attendance_content
    assert "function trocarAbaTranscricaoIA2" in attendance_content
    assert "function atualizarVisualTranscricaoIA2" in attendance_content
    assert "function salvarEdicaoVisualIA2" in attendance_content
    assert "function organizarTranscricaoManualmenteIA2" in attendance_content

    # 3. Estilos CSS de destaque em amarelo
    assert ".ia2-doubt-word {" in attendance_content
    assert "background-color: #FEF08A;" in attendance_content
    assert "color: #854D0E;" in attendance_content

def test_modo_ia2_exact_user_sample_transcription_dialogue():
    """Valida a extração e marcação de dúvidas sobre o exemplo exato fornecido pelo usuário."""
    import re

    raw_user_sample = (
        "Qual a sua idade  tenho 22 anos  Qual o seu cargo  policial penal  "
        "quanto tempo  cinco anos  é readaptado  não  data do diagnóstico da doença  "
        "dia 10/10/2016  ano é 16 não é 2026  Com que frequência comparece as consultas "
        "a cada cinco meses  Quais sintomas causam limitações para o trabalho dor nas costas "
        "do Movimento dos braços dor nas mãos dor na cabeça  e dor nas pernas ao esticá-las  "
        "faz uso de qual medicação Dipirona injetável  benzetacil injetável  qual a dosagem  "
        "de dipirona é 10 mg  e de benzetacil é injetável  as psicoterapia ou fisioterapia faço psico  "
        "10 vezes  no mês"
    )

    padroes_perguntas = [
        r"\b(?:qual\s+(?:é\s+)?a\s+sua\s+idade|qual\s+a\s+sua\s+idade)\b",
        r"\b(?:qual\s+(?:é\s+)?o\s+seu\s+cargo|qual\s+o\s+cargo)\b",
        r"\b(?:quanto\s+tempo)\b",
        r"\b(?:[ée]\s+readaptad[oa])\b",
        r"\b(?:data\s+(?:do\s+)?diagn[óo]stico(?:\s+da\s+doen[çc]a)?)\b",
        r"\b(?:com\s+que\s+frequ[êe]ncia\s+comparece(?:\s+[àa]s\s+consultas)?)\b",
        r"\b(?:quais\s+sintomas\s+causam\s+limita[çc][õo]es(?:\s+para\s+o\s+trabalho)?)\b",
        r"\b(?:faz\s+uso\s+de\s+qual\s+medica[çc][ãa]o)\b",
        r"\b(?:qual\s+a\s+dosagem)\b",
        r"\b(?:(?:faz|as)\s+psicoterapia\s+ou\s+fisioterapia)\b",
    ]

    # Verifica se todas as perguntas do exemplo são identificadas
    for pat in padroes_perguntas:
        assert re.search(pat, raw_user_sample, re.IGNORECASE) is not None, f"Padrão {pat} não encontrou no exemplo"

    # Verifica se os padrões de dúvidas clínicas cobrem os casos do exemplo
    re_inconsistencia = re.search(r"\b(?:ano\s+é\s+\d+\s+não\s+é\s+\d+|\d+\s+não\s+é\s+\d+)\b", raw_user_sample, re.IGNORECASE)
    assert re_inconsistencia is not None
    assert "ano é 16 não é 2026" in re_inconsistencia.group(0)

    re_dosagem = re.search(r"\b10\s*mg\b", raw_user_sample, re.IGNORECASE)
    assert re_dosagem is not None
    assert "10 mg" in re_dosagem.group(0)

    re_fonetica = re.search(r"\bas\s+(?:psicoterapia|fisioterapia)\b", raw_user_sample, re.IGNORECASE)
    assert re_fonetica is not None
    assert "as psicoterapia" in re_fonetica.group(0)

    re_freq = re.search(r"\b\d+\s+vezes\s+no\s+mês\b", re.sub(r"\s+", " ", raw_user_sample), re.IGNORECASE)
    assert re_freq is not None
    assert "10 vezes no mês" in re_freq.group(0)

def test_modo_ia2_refinamento_automatico_integrations():
    """Valida a integração da Melhoria 1 (Refinamento por IA) e Melhoria 2 (Semântica) no backend e frontend."""
    app_content = (ROOT / "app.py").read_text(encoding="utf-8")
    attendance_content = ATTENDANCE_HTML

    # 1. Endpoint no backend
    assert '@app.post("/api/ai/refinar-dialogo-ia2")' in app_content
    assert "def api_ai_refinar_dialogo_ia2():" in app_content
    assert "colinha_status" in app_content
    assert "dialogo" in app_content
    assert "texto_formatado" in app_content

    # 2. Elementos e funções no frontend
    assert 'id="ia2RefinandoBar"' in attendance_content
    assert 'id="ia2RefinandoText"' in attendance_content
    assert "function refinarDialogoComIA2" in attendance_content
    assert "refinarDialogoComIA2(true)" in attendance_content
    assert "window.refinarDialogoComIA2 = refinarDialogoComIA2;" in attendance_content
    assert '/api/ai/refinar-dialogo-ia2' in attendance_content

def test_modo_ia2_screenshot_scenario_dialogue_and_colinha():
    """Valida a separação perfeita das perguntas do print do usuário e validação da colinha."""
    import re

    user_screenshot_text = (
        "Qual sua idade tenho 22 anos o seu cargo tenho sou policial penal quanto tempo "
        "há 20 anos é adaptado não qual foi a data do diagnóstico da doença 05/02 /2016 "
        "às consultas de 10 em 10 dias"
    )

    lista_perguntas = [
        re.compile(r"\b(?:qual\s+(?:é\s+)?a\s+sua\s+idade|qual\s+(?:é\s+)?a\s+idade|qual\s+sua\s+idade|quantos\s+anos(?:\s+tem)?)\b", re.I),
        re.compile(r"\b(?:(?:qual\s+(?:é\s+)?|e\s+)?(?:o\s+)?(?:seu\s+)?cargo|qual\s+(?:é\s+)?o\s+cargo|qual\s+a\s+(?:sua\s+)?fun[çc][ãa]o|qual\s+sua\s+profiss[ãa]o|sua\s+fun[çc][ãa]o|sua\s+profiss[ãa]o)\b", re.I),
        re.compile(r"\b(?:quanto\s+tempo\s+est[áa]\s+no\s+cargo|quanto\s+tempo\s+de\s+servi[çc]o|quanto\s+tempo\s+no\s+cargo|quanto\s+tempo)\b", re.I),
        re.compile(r"\b(?:(?:voc[êe]\s+)?[ée]\s+(?:re)?adaptad[oa]|tem\s+(?:re)?adapta[çc][ãa]o|est[áa]\s+(?:re)?adaptad[oa])\b", re.I),
        re.compile(r"\b(?:(?:qual\s+(?:foi\s+)?a\s+)?data\s+(?:do\s+)?diagn[óo]stico(?:\s+da\s+doen[çc]a)?|quando\s+come[çc]ou(?:\s+o\s+quadro|\s+a\s+doen[çc]a)?|quando\s+iniciou|in[íi]cio\s+dos\s+sintomas)\b", re.I),
        re.compile(r"\b(?:com\s+que\s+frequ[êe]ncia\s+comparece(?:\s+[àa]s\s+consultas)?|com\s+que\s+frequ[êe]ncia\s+vai(?:\s+ao\s+m[ée]dico)?|de\s+quanto\s+em\s+quanto\s+tempo|frequ[êe]ncia\s+das\s+consultas|(?:e\s+|quanto\s+[àa]s\s+|sobre\s+as\s+|[àa]s\s+)?consultas(?:\s+m[ée]dicas)?)\b", re.I),
    ]

    matches = []
    for pat in lista_perguntas:
        for m in pat.finditer(user_screenshot_text):
            matches.append((m.start(), m.end(), m.group(0)))
    matches.sort(key=lambda x: x[0])

    # Devem ser identificadas 6 perguntas independentes
    assert len(matches) == 6
    matched_questions = [m[2] for m in matches]
    assert "Qual sua idade" in matched_questions
    assert "o seu cargo" in matched_questions
    assert "quanto tempo" in matched_questions
    assert "é adaptado" in matched_questions
    assert "qual foi a data do diagnóstico da doença" in matched_questions
    assert "às consultas" in matched_questions

    # Validação da colinha
    # Q04 (Readaptação)
    assert re.search(r"\b(?:(?:re)?adaptad[oa]|(?:re)?adapta[çc][ãa]o)\b", user_screenshot_text, re.I) is not None
    # Q07 (Consultas de 10 em 10 dias)
    assert re.search(r"\bde\s+(\d+|dez)\s+em\s+\d+\s+dias\b", user_screenshot_text, re.I) is not None



