import asyncio
import os
import sys
import argparse
from pathlib import Path
import edge_tts

# Força codificação UTF-8 na saída do console do Windows
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 1. Diálogo Completo Tradicional (16 Perguntas cobrindo o roteiro e exame físico)
DIALOGO_COMPLETO = [
    ("pt-BR-ThalitaNeural", "Bom dia! Pode entrar e sentar-se. Para iniciarmos a sua avaliação médica pericial, qual é o seu nome completo e o seu CPF?"),
    ("pt-BR-AntonioNeural", "Bom dia, doutora. O meu nome completo é Eduardo Henrique Cavalcanti, e o meu CPF é 345, ponto, 678, ponto, 901, traço, 22."),
    
    ("pt-BR-ThalitaNeural", "Qual é a sua idade atual, Eduardo?"),
    ("pt-BR-AntonioNeural", "Tenho 47 anos, doutora."),
    
    ("pt-BR-ThalitaNeural", "Qual é o seu cargo público e há quanto tempo você trabalha nessa função?"),
    ("pt-BR-AntonioNeural", "Sou Professor de Educação Básica dois, dou aulas de Matemática há 16 anos na rede estadual."),
    
    ("pt-BR-ThalitaNeural", "Você é readaptado atualmente ou já esteve readaptado anteriormente?"),
    ("pt-BR-AntonioNeural", "Sim, doutora, sou readaptado há 2 anos. Atualmente trabalho no apoio pedagógico da biblioteca e na secretaria da escola, organizando planilhas e atendendo alunos no balcão."),
    
    ("pt-BR-ThalitaNeural", "Qual é a doença que está a tratar hoje e que motivou este pedido de afastamento?"),
    ("pt-BR-AntonioNeural", "Estou a tratar um agravamento severo de transtorno depressivo recorrente associado a síndrome do pânico e também uma crise aguda de hérnia de disco cervical e lombar. O médico colocou os CIDs F33.2, F41.0 e M54.2."),
    
    ("pt-BR-ThalitaNeural", "Quando começou exatamente esse tratamento médico?"),
    ("pt-BR-AntonioNeural", "O tratamento psiquiátrico começou há cerca de 1 ano e meio, mas a crise na coluna e a piora da depressão aconteceram há 30 dias."),
    
    ("pt-BR-ThalitaNeural", "Com que frequência você realiza consultas com os seus médicos assistentes?"),
    ("pt-BR-AntonioNeural", "Passo no psiquiatra a cada 15 dias e no ortopedista uma vez por mês."),
    
    ("pt-BR-ThalitaNeural", "Quais são os sintomas físicos e mentais que você sente no dia a dia?"),
    ("pt-BR-AntonioNeural", "Sinto uma tristeza profunda, crises de choro sem motivo na escola, falta de ar, taquicardia, insónia todas as noites, falha de memória e uma dor terrível no pescoço que irradia para o ombro e adormece a mão direita."),
    
    ("pt-BR-ThalitaNeural", "De que forma esses sintomas limitam as suas atividades atuais de readaptado na biblioteca e secretaria?"),
    ("pt-BR-AntonioNeural", "Não consigo concentrar-me nos relatórios, esqueço o que acabei de ler, tenho ataques de pânico quando há barulho de alunos no pátio e não consigo digitar nem segurar livros pesados por causa da perda de força no braço e na mão direita."),
    
    ("pt-BR-ThalitaNeural", "Quais medicamentos você está a tomar atualmente, com as respetivas dosagens em miligramas e horários?"),
    ("pt-BR-AntonioNeural", "Tomo desvenlafaxina de 100 miligramas uma vez ao dia pela manhã, clonazepam de 2 miligramas à noite, quetiapina que acho que é de 25 ou 50 miligramas antes de dormir, não tenho bem a certeza da dose da quetiapina, e para a dor tomo pregabalina de 75 miligramas de 12 em 12 horas e ciclobenzaprina de 10 miligramas."),
    
    ("pt-BR-ThalitaNeural", "Houve alguma troca de medicação ou aumento de dosagem recentemente? Quando foi?"),
    ("pt-BR-AntonioNeural", "Sim, doutora. Há 12 dias o psiquiatra subiu a desvenlafaxina de 50 para 100 miligramas por dia e introduziu a quetiapina porque eu não conseguia dormir nada."),
    
    ("pt-BR-ThalitaNeural", "Você realiza acompanhamento com psicoterapia ou fisioterapia? Qual a periodicidade?"),
    ("pt-BR-AntonioNeural", "Faço os dois, doutora. Faço psicoterapia uma vez por semana às terças-feiras e fisioterapia motora para a coluna cervical duas vezes por semana."),
    
    ("pt-BR-ThalitaNeural", "Possui outras doenças em tratamento contínuo, como hipertensão arterial, diabetes, problemas cardíacos ou de tiroide?"),
    ("pt-BR-AntonioNeural", "Sim, tenho hipertensão arterial sistémica e colesterol alto. Tomo losartana potássica de 50 miligramas pela manhã, hidroclorotiazida de 25 miligramas e sinvastatina de 20 miligramas à noite."),
    
    ("pt-BR-ThalitaNeural", "Já passou por alguma cirurgia prévia ou internamento hospitalar relevante no seu histórico pregresso?"),
    ("pt-BR-AntonioNeural", "Fiz apenas uma cirurgia de apendicite há 10 anos atrás, sem complicações."),
    
    ("pt-BR-ThalitaNeural", "Quais exames complementares e atestados você trouxe hoje para a perícia?"),
    ("pt-BR-AntonioNeural", "Trouxe o laudo do psiquiatra com CRM 98765 solicitando 45 dias de afastamento emitido ontem, além de uma ressonância da coluna cervical mostrando protrusão em C5-C6."),
    
    ("pt-BR-ThalitaNeural", "Vou agora aferir os seus sinais vitais e registar o exame físico. Qual é o seu peso e a sua altura aproximada?"),
    ("pt-BR-AntonioNeural", "Tenho 1 metro e 78 de altura e estou a pesar 86 quilos."),
    
    ("pt-BR-ThalitaNeural", "Perfeito. Registo pressão arterial aferida em 130 por 85 milímetros de mercúrio e pulso de 84 batimentos por minuto. Ao exame mental e osteomuscular, paciente apresenta-se choroso, humor hipotímico, pensamento lentificado, além de limitação dolorosa da mobilidade cervical, ombro direito e redução de força de preensão na mão direita. Parecer favorável aos 45 dias solicitados.")
]

# 2. Cenário Ortopedia com Autocorreção e Perguntas Pendentes
DIALOGO_ORTOPEDIA_PENDENCIAS = [
    ("pt-BR-ThalitaNeural", "Bom dia! Por favor, informe sua idade, seu cargo e quanto tempo está no Estado."),
    ("pt-BR-AntonioNeural", "Bom dia doutora. Eu tenho 42... não, na verdade completei 43 anos semana passada. Sou inspetor de alunos há 12 anos concursado."),
    ("pt-BR-ThalitaNeural", "Você já é readaptado no momento?"),
    ("pt-BR-AntonioNeural", "Não senhora, nunca fui readaptado."),
    ("pt-BR-ThalitaNeural", "Qual é o diagnóstico e quando começou essa dor na coluna?"),
    ("pt-BR-AntonioNeural", "É hérnia de disco lombar L4-L5 e lombociatalgia que desce para a perna esquerda. Começou em maio de 2025 após carregar caixas pesadas de merenda."),
    ("pt-BR-ThalitaNeural", "Quais sintomas te impedem de trabalhar na escola?"),
    ("pt-BR-AntonioNeural", "Muita dor lombar aguda ao ficar em pé mais de 10 minutos e formigamento no pé esquerdo."),
    ("pt-BR-ThalitaNeural", "Quais remédios você toma e quais as doses?"),
    ("pt-BR-AntonioNeural", "Tomo pregabalina de 75 ou 150 mg à noite, não tenho bem certeza da dose, e tomo tramadol de 50 mg se a dor for insuportável."),
    ("pt-BR-ThalitaNeural", "Já fez cirurgia de coluna ou infiltração?"),
    ("pt-BR-AntonioNeural", "Fiz uma infiltração na lombar em agosto, mas nunca operei.")
]

# 3. Cenário Psiquiatria com Fármacos e Perguntas Adicionais
DIALOGO_PSIQUIATRIA = [
    ("pt-BR-ThalitaNeural", "Olá, vamos iniciar a perícia. Qual sua idade e função atual no Estado?"),
    ("pt-BR-AntonioNeural", "Olá doutora, tenho 39 anos e sou escrivão de polícia há 9 anos."),
    ("pt-BR-ThalitaNeural", "Está readaptado ou exercendo a função normal?"),
    ("pt-BR-AntonioNeural", "Estou em função interna no arquivo, sem porte de arma, em processo de readaptação."),
    ("pt-BR-ThalitaNeural", "Qual a doença que motivou o afastamento e quando iniciou o tratamento?"),
    ("pt-BR-AntonioNeural", "Transtorno depressivo maior grave com ideação e ansiedade generalizada CID F32.2. Iniciou em janeiro de 2024."),
    ("pt-BR-ThalitaNeural", "Com que frequência vai às consultas médicas?"),
    ("pt-BR-AntonioNeural", "Vou ao psiquiatra mensalmente, uma vez a cada 30 dias."),
    ("pt-BR-ThalitaNeural", "Quais remédios toma atualmente, com doses exatas?"),
    ("pt-BR-AntonioNeural", "Tomo desvenlafaxina de 100 mg pela manhã, quetiapina de 50 mg antes de dormir e ciclobenzaprina de 10 mg se tiver tensão muscular."),
    ("pt-BR-ThalitaNeural", "Houve aumento recente de dosagens?"),
    ("pt-BR-AntonioNeural", "Sim, há 3 semanas o psiquiatra dobrou a desvenlafaxina de 50 para 100 mg porque eu tinha crises de choro."),
    ("pt-BR-ThalitaNeural", "Faz psicoterapia?"),
    ("pt-BR-AntonioNeural", "Sim, psicoterapia semanal com psicóloga toda quinta-feira."),
    ("pt-BR-ThalitaNeural", "Como é sua rotina e rede de apoio familiar em casa?"),
    ("pt-BR-AntonioNeural", "Moro com minha esposa que cuida das medicações porque às vezes esqueço se tomei ou não.")
]

# 4. Cenário Fala Rápida / Respostas Condensadas
DIALOGO_FALA_RAPIDA = [
    ("pt-BR-ThalitaNeural", "Pode sentar. Me diga sua idade, cargo, tempo de casa e se é readaptado."),
    ("pt-BR-AntonioNeural", "55 anos, agente de organização escolar, 21 anos de Estado, não sou readaptado."),
    ("pt-BR-ThalitaNeural", "Qual o problema de saúde e desde quando?"),
    ("pt-BR-AntonioNeural", "Tendinite crônica de ombro direito e síndrome do manguito rotador, desde setembro de 2023."),
    ("pt-BR-ThalitaNeural", "Com que frequência passa no médico e o que não consegue fazer no trabalho?"),
    ("pt-BR-AntonioNeural", "Vou a cada 40 dias. Não consigo carregar pastas, arquivar documentos no alto nem digitar por muito tempo."),
    ("pt-BR-ThalitaNeural", "Remédios e fisioterapia?"),
    ("pt-BR-AntonioNeural", "Tomo meloxicam de 15 mg ao dia e torsilax nas crises. Faço fisioterapia 3 vezes na semana.")
]

# 5. Cenário Contradições e Divagações (Teste de detecção de dúvidas e limpeza de ruído)
DIALOGO_CONTRADICOES = [
    ("pt-BR-ThalitaNeural", "Bom dia! Qual é a sua idade, seu cargo e há quanto tempo trabalha no Estado?"),
    ("pt-BR-AntonioNeural", "Bom dia doutora... olha, minha vida está muito difícil, meu genro perdeu o emprego mês passado... ah, desculpe, eu tenho 58 anos, sou merendeiro escolar e trabalho no Estado há 22 anos."),
    ("pt-BR-ThalitaNeural", "O senhor é readaptado atualmente?"),
    ("pt-BR-AntonioNeural", "Sim, sou readaptado há 4 anos, hoje fico só entregando chave e cuidando do portão da escola."),
    ("pt-BR-ThalitaNeural", "Qual é a doença que motivou o pedido de licença e quando foi o diagnóstico?"),
    ("pt-BR-AntonioNeural", "É depressão grave e síndrome do pânico, CID F33. O diagnóstico foi em março de 2022... quer dizer, na verdade o médico falou que começou mesmo foi em novembro de 2025, não sei se o laudo antigo valia."),
    ("pt-BR-ThalitaNeural", "Com que frequência o senhor passa em consulta médica e o que sente no trabalho?"),
    ("pt-BR-AntonioNeural", "Vou ao médico a cada 20 dias. No trabalho sinto tremedeira nas mãos, choro constante, medo de sair de casa e tontura."),
    ("pt-BR-ThalitaNeural", "Quais medicamentos está tomando e quais as dosagens em miligramas?"),
    ("pt-BR-AntonioNeural", "Tomo sertralina de 100 miligramas de manhã e à noite tomo um comprimido de tarja preta que não lembro se é clonazepam ou alprazolam, acho que é de 2 miligramas."),
    ("pt-BR-ThalitaNeural", "O senhor faz psicoterapia ou fisioterapia?"),
    ("pt-BR-AntonioNeural", "Faço psicoterapia toda quarta-feira no posto de saúde.")
]

# 6. Cenário Cardiologia Pós-Cirúrgico
DIALOGO_CARDIOLOGIA = [
    ("pt-BR-ThalitaNeural", "Olá, pode se sentar. Informe por gentileza sua idade, cargo e tempo de serviço."),
    ("pt-BR-AntonioNeural", "Bom dia doutora. Tenho 61 anos, sou diretor de escola estadual há 28 anos."),
    ("pt-BR-ThalitaNeural", "O senhor é readaptado?"),
    ("pt-BR-AntonioNeural", "Não doutora, nunca fui readaptado, sempre atuei na direção."),
    ("pt-BR-ThalitaNeural", "Qual foi o problema de saúde que gerou o afastamento e a data do ocorrido?"),
    ("pt-BR-AntonioNeural", "Sofri um infarto agudo do miocárdio no dia 14 de setembro de 2025 e precisei colocar dois stents coronarianos de urgência. O CID é I21."),
    ("pt-BR-ThalitaNeural", "Com que frequência está passando no cardiologista?"),
    ("pt-BR-AntonioNeural", "Estou passando em consulta quinzenalmente para controle rigoroso."),
    ("pt-BR-ThalitaNeural", "Quais sintomas ainda sente que limitam seu retorno à direção da escola?"),
    ("pt-BR-AntonioNeural", "Sinto cansaço extremo aos pequenos esforços, falta de ar ao subir as escadas da escola e dor no peito quando passo por estresse em reuniões."),
    ("pt-BR-ThalitaNeural", "Quais medicações está utilizando e em quais dosagens diárias?"),
    ("pt-BR-AntonioNeural", "Uso clopidogrel de 75 miligramas ao dia, ácido acetilsalicílico de 100 miligramas no almoço, carvedilol de 25 miligramas de 12 em 12 horas e rosuvastatina de 20 miligramas à noite."),
    ("pt-BR-ThalitaNeural", "Está fazendo fisioterapia ou reabilitação cardiovascular?"),
    ("pt-BR-AntonioNeural", "Sim, faço fisioterapia de reabilitação cardíaca supervisionada duas vezes por semana."),
    ("pt-BR-ThalitaNeural", "Trouxe o ecocardiograma recente? Qual foi a fração de ejeção?"),
    ("pt-BR-AntonioNeural", "Trouxe sim doutora, o ecocardiograma da semana passada mostrou fração de ejeção de 42 por cento.")
]

# 7. Cenário Respostas Negativas (Sem medicação e sem fisioterapia iniciada)
DIALOGO_NEGATIVAS = [
    ("pt-BR-ThalitaNeural", "Boa tarde. Qual é a sua idade, seu cargo e há quanto tempo está na função?"),
    ("pt-BR-AntonioNeural", "Boa tarde doutora. Tenho 34 anos, sou professor de educação física há 6 anos."),
    ("pt-BR-ThalitaNeural", "Você é readaptado?"),
    ("pt-BR-AntonioNeural", "Não sou readaptado."),
    ("pt-BR-ThalitaNeural", "Qual é a lesão que motivou o afastamento e quando aconteceu?"),
    ("pt-BR-AntonioNeural", "Ruptura parcial do ligamento cruzado anterior do joelho direito, CID S83.5. Aconteceu no dia 2 de outubro de 2025 durante aula na quadra."),
    ("pt-BR-ThalitaNeural", "Com que frequência passa no ortopedista e o que sente no joelho?"),
    ("pt-BR-AntonioNeural", "Passo a cada 15 dias. Meu joelho está muito inchado, falseando e não consigo dobrar nem correr na quadra."),
    ("pt-BR-ThalitaNeural", "Você está tomando alguma medicação no momento? Se sim, qual a dosagem?"),
    ("pt-BR-AntonioNeural", "Não estou tomando nenhum medicamento agora, doutora, porque tive alergia ao anti-inflamatório e o médico mandou suspender todas as doses e usar apenas compressa de gelo."),
    ("pt-BR-ThalitaNeural", "Já iniciou as sessões de fisioterapia?"),
    ("pt-BR-AntonioNeural", "Ainda não iniciei a fisioterapia porque o ortopedista pediu para aguardar desinchar mais uma semana antes de começar.")
]

CENARIOS_DISPONIVEIS = {
    "completo": ("atendimento_completo_muitas_perguntas.mp3", DIALOGO_COMPLETO, "Atendimento Completo com 16 Perguntas e Exame Físico"),
    "ortopedia": ("atendimento_ortopedia_pendencias.mp3", DIALOGO_ORTOPEDIA_PENDENCIAS, "Ortopedia com Autocorreção e Perguntas Omitidas"),
    "psiquiatria": ("atendimento_psiquiatria_farmacos.mp3", DIALOGO_PSIQUIATRIA, "Psiquiatria com Fármacos Complexos e Apoio Familiar"),
    "rapido": ("atendimento_fala_rapida_condensada.mp3", DIALOGO_FALA_RAPIDA, "Fala Rápida com Respostas Condensadas"),
    "contradicoes": ("atendimento_contradicoes_divagacoes.mp3", DIALOGO_CONTRADICOES, "Paciente Confuso com Divagações e Contradição de Datas"),
    "cardiologia": ("atendimento_cardiologia_pos_cirurgico.mp3", DIALOGO_CARDIOLOGIA, "Cardiologia Pós-Infarto com Stents e Reabilitação"),
    "negativas": ("atendimento_respostas_negativas.mp3", DIALOGO_NEGATIVAS, "Respostas Negativas (Sem Medicação e Sem Fisioterapia)")
}

async def sintetizar_dialogo(arquivo_saida, dialogo, descricao=""):
    print(f"\n🎙️  Iniciando síntese de áudio: {arquivo_saida}")
    if descricao:
        print(f"    Descrição: {descricao}")
    print(f"    Total de turnos de fala: {len(dialogo)}")

    temp_bytes = bytearray()
    total = len(dialogo)

    for idx, (voz, texto) in enumerate(dialogo, 1):
        papel = "Médica Perita" if "Thalita" in voz else "Paciente/Servidor"
        print(f"    [{idx:02d}/{total:02d}] Sintetizando {papel}...", end="", flush=True)

        sucesso = False
        ultimo_erro = None

        # Tentativas com backoff exponencial para contornar oscilações de conexão no edge_tts
        for tentativa in range(4):
            try:
                comunicador = edge_tts.Communicate(texto, voz, rate="+0%")
                async for chunk in comunicador.stream():
                    if chunk["type"] == "audio":
                        temp_bytes.extend(chunk["data"])
                sucesso = True
                print(" OK")
                await asyncio.sleep(0.3)  # Intervalo de segurança anti-throttling
                break
            except Exception as e:
                ultimo_erro = e
                await asyncio.sleep(1.0 * (tentativa + 1))

        if not sucesso:
            print(f" FALHA ({ultimo_erro})")
            raise RuntimeError(f"Erro ao sintetizar fala {idx}: {ultimo_erro}")

    with open(arquivo_saida, "wb") as f:
        f.write(temp_bytes)

    tamanho_kb = len(temp_bytes) / 1024
    print(f"✅ Áudio gerado com sucesso: {arquivo_saida} ({tamanho_kb:.1f} KB)\n")

async def main():
    parser = argparse.ArgumentParser(description="Gerador de Áudios de Consultas Médicas Periciais com Edge-TTS")
    parser.add_argument(
        "--cenario",
        choices=list(CENARIOS_DISPONIVEIS.keys()) + ["todos"],
        default="completo",
        help="Cenário clínico a ser gerado (padrão: completo)"
    )
    args = parser.parse_args()

    if args.cenario == "todos":
        print("🚀 Gerando TODOS os cenários clínicos de teste...")
        for chave, (arq, diag, desc) in CENARIOS_DISPONIVEIS.items():
            await sintetizar_dialogo(arq, diag, desc)
        print("🎉 Todos os áudios foram gerados com sucesso!")
    else:
        arq, diag, desc = CENARIOS_DISPONIVEIS[args.cenario]
        await sintetizar_dialogo(arq, diag, desc)

if __name__ == "__main__":
    asyncio.run(main())