import asyncio
import io
import json
import os
from pathlib import Path
import pytest
import edge_tts
from app import app

# Cenários de teste clínicos
CENARIOS = {
    "cenario_a_ortopedia_pendencias": {
        "descricao": "Ortopedia com autocorreção, dosagem incerta e itens omitidos (sem freq. consultas e sem fisioterapia)",
        "dialogo": [
            ("pt-BR-ThalitaNeural", "Bom dia! Por favor, informe sua idade, seu cargo e quanto tempo está no Estado."),
            ("pt-BR-AntonioNeural", "Bom dia doutora. Eu tenho 42... não, na verdade completei 43 anos semana passada. Sou inspetor de alunos há 12 anos concursado."),
            ("pt-BR-ThalitaNeural", "Você já é readaptado no momento?"),
            ("pt-BR-AntonioNeural", "Não senhora, nunca fui readaptado."),
            ("pt-BR-ThalitaNeural", "Qual é o diagnóstico e quando começou essa dor na coluna?"),
            ("pt-BR-AntonioNeural", "É hérnia de disco lombar L4-L5 e lombociatalgia que desce pra perna esquerda. Começou em maio de 2025 após carregar caixas de merenda."),
            ("pt-BR-ThalitaNeural", "Quais sintomas te impedem de trabalhar na escola?"),
            ("pt-BR-AntonioNeural", "Muita dor lombar aguda ao ficar em pé mais de 10 minutos e formigamento no pé esquerdo."),
            ("pt-BR-ThalitaNeural", "Quais remédios você toma e quais as doses?"),
            ("pt-BR-AntonioNeural", "Tomo pregabalina acho que de 75 ou talvez 150 mg à noite, não tenho bem certeza da dose, e tomo tramadol de 50 mg se a dor for insuportável."),
            ("pt-BR-ThalitaNeural", "Já fez cirurgia de coluna ou infiltração?"),
            ("pt-BR-AntonioNeural", "Fiz uma infiltração na lombar em agosto, mas nunca operei.")
        ],
        "esperados": {
            "itens_respondidos": [1, 2, 3, 4, 5, 6, 8, 9, 10],
            "itens_pendentes": [7, 11],  # 7: consultas, 11: fisioterapia
            "idade_esperada": "43",
            "perguntas_adicionais": True
        }
    },
    "cenario_b_psiquiatria_farmacos": {
        "descricao": "Psiquiatria com fármacos complexos, alteração de dosagem e perguntas extras de apoio familiar",
        "dialogo": [
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
        ],
        "esperados": {
            "itens_respondidos": [1, 2, 3, 4, 5, 6, 7, 9, 10, 11],
            "farmacos_corretos": ["desvenlafaxina", "quetiapina", "ciclobenzaprina"],
            "perguntas_adicionais": True
        }
    },
    "cenario_c_fala_rapida_condensada": {
        "descricao": "Servidor com respostas condensadas e telegráficas",
        "dialogo": [
            ("pt-BR-ThalitaNeural", "Pode sentar. Me diga sua idade, cargo, tempo de casa e se é readaptado."),
            ("pt-BR-AntonioNeural", "55 anos, agente de organização escolar, 21 anos de Estado, não sou readaptado."),
            ("pt-BR-ThalitaNeural", "Qual o problema de saúde e desde quando?"),
            ("pt-BR-AntonioNeural", "Tendinite crônica de ombro direito e síndrome do manguito rotador, desde setembro de 2023."),
            ("pt-BR-ThalitaNeural", "Com que frequência passa no médico e o que não consegue fazer no trabalho?"),
            ("pt-BR-AntonioNeural", "Vou a cada 40 dias. Não consigo carregar pastas, arquivar documentos no alto nem digitar por muito tempo."),
            ("pt-BR-ThalitaNeural", "Remédios e fisioterapia?"),
            ("pt-BR-AntonioNeural", "Tomo meloxicam de 15 mg ao dia e torsilax nas crises. Faço fisioterapia 3 vezes na semana.")
        ],
        "esperados": {
            "itens_respondidos": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            "desmembramento_completo": True
        }
    }
}

async def gerar_arquivo_audio(caminho_saida, dialogo):
    temp_bytes = bytearray()
    for idx, (voz, texto) in enumerate(dialogo):
        sucesso = False
        ultimo_erro = None
        for tentativa in range(4):
            try:
                comm = edge_tts.Communicate(texto, voz, rate="+0%")
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        temp_bytes.extend(chunk["data"])
                sucesso = True
                await asyncio.sleep(0.3)
                break
            except Exception as e:
                ultimo_erro = e
                await asyncio.sleep(1.0 * (tentativa + 1))
        if not sucesso:
            raise RuntimeError(f"Falha ao sintetizar voz no turno {idx+1}: {ultimo_erro}")
    with open(caminho_saida, "wb") as f:
        f.write(temp_bytes)

def rodar_teste_cenario(nome_cenario, dados_cenario):
    arquivo_mp3 = Path(f"teste_{nome_cenario}.mp3")
    print(f"\n========================================================")
    print(f"TESTANDO: {nome_cenario}")
    print(f"Descricao: {dados_cenario['descricao']}")
    print(f"========================================================")
    
    if not arquivo_mp3.exists() or arquivo_mp3.stat().st_size < 1000:
        print("Gerando audio via edge_tts com retentativas...")
        asyncio.run(gerar_arquivo_audio(arquivo_mp3, dados_cenario["dialogo"]))
        print(f"Audio gerado com sucesso: {arquivo_mp3} ({arquivo_mp3.stat().st_size} bytes)")
    
    client = app.test_client()
    data = {
        "audio": (open(arquivo_mp3, "rb"), arquivo_mp3.name, "audio/mp3")
    }
    
    print("Enviando para o endpoint /api/ai/refinar-dialogo-ia2...")
    resp = client.post("/api/ai/refinar-dialogo-ia2", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200, f"Falha HTTP {resp.status_code}: {resp.data.decode('utf-8')}"
    
    res = resp.get_json()
    res_data = res.get("data") or res
    
    dialogo = res_data.get("dialogo") or []
    colinha_status = res_data.get("colinha_status") or []
    texto_formatado = res_data.get("texto_formatado") or ""
    
    print(f"-> Total cartoes dialogo: {len(dialogo)}")
    print(f"-> Itens colinha avaliados: {len(colinha_status)}")
    
    respondidos = [x.get("id") for x in colinha_status if x.get("matched")]
    pendentes = [x.get("id") for x in colinha_status if not x.get("matched")]
    perguntas_extras = [x for x in dialogo if x.get("colinha_id") is None]
    
    print(f"-> Itens Colinha Respondidos: {respondidos}")
    print(f"-> Itens Colinha Pendentes: {pendentes}")
    print(f"-> Perguntas Complementares (colinha_id: null): {len(perguntas_extras)}")
    
    for pe in perguntas_extras:
        print(f"   [Extra] P: {pe.get('pergunta') or pe.get('texto')} | R: {pe.get('resposta')}")
    
    # Validacoes especificas por cenario
    esperados = dados_cenario.get("esperados", {})
    if "itens_pendentes" in esperados:
        for p in esperados["itens_pendentes"]:
            assert p in pendentes, f"Item {p} deveria estar pendente mas foi marcado como respondido!"
            print(f"   [OK] Confirmacao: Item {p} corretamente detectado como PENDENTE!")
            
    if "farmacos_corretos" in esperados:
        full_text = texto_formatado.lower()
        for f in esperados["farmacos_corretos"]:
            if f in full_text:
                print(f"   [OK] Farmaco '{f}' reconhecido e grafado corretamente!")
            else:
                print(f"   [ALERTA] Farmaco '{f}' nao localizado com grafia exata no texto formatado.")
                
    if "idade_esperada" in esperados:
        assert esperados["idade_esperada"] in texto_formatado, f"Idade corrigida {esperados['idade_esperada']} nao encontrada no texto formatado!"
        print(f"   [OK] Autocorrecao: Idade {esperados['idade_esperada']} anos capturada com precisao!")

    return {
        "cenario": nome_cenario,
        "dialogo_count": len(dialogo),
        "respondidos": respondidos,
        "pendentes": pendentes,
        "extras_count": len(perguntas_extras),
        "sucesso": True
    }

if __name__ == "__main__":
    relatorios = []
    for nome, dados in CENARIOS.items():
        try:
            rel = rodar_teste_cenario(nome, dados)
            relatorios.append(rel)
        except Exception as e:
            print(f"[ERRO] Falha no cenario {nome}: {e}")
            relatorios.append({"cenario": nome, "erro": str(e), "sucesso": False})
            
    Path("relatorio_bateria_testes.json").write_text(json.dumps(relatorios, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\nBateria de testes finalizada! Relatorio salvo em relatorio_bateria_testes.json")
