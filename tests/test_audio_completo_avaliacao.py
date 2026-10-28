import io
import json
from pathlib import Path
import pytest
from app import app

@pytest.mark.skipif(
    not Path("atendimento_completo_muitas_perguntas.mp3").exists(),
    reason="Arquivo de áudio local atendimento_completo_muitas_perguntas.mp3 não presente"
)
def test_avaliar_audio_longo_mp3():
    mp3_path = Path("atendimento_completo_muitas_perguntas.mp3")
    
    client = app.test_client()
    data = {
        "audio": (open(mp3_path, "rb"), "atendimento_completo_muitas_perguntas.mp3", "audio/mp3")
    }
    
    resp = client.post("/api/ai/refinar-dialogo-ia2", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200, f"Erro status {resp.status_code}: {resp.data.decode('utf-8')}"
    
    json_data = resp.get_json()
    res_data = json_data.get("data") or json_data
    
    dialogo = res_data.get("dialogo") or []
    colinha_status = res_data.get("colinha_status") or []
    texto_formatado = res_data.get("texto_formatado") or ""
    
    print("\n--- RESULTADOS DO TESTE COM ÁUDIO LONGO ---")
    print(f"Total de itens no diálogo: {len(dialogo)}")
    print(f"Total de itens da colinha: {len(colinha_status)}")
    print(f"Itens da colinha respondidos: {sum(1 for x in colinha_status if x.get('matched'))}")
    print(f"Tamanho do texto formatado: {len(texto_formatado)} chars")
    
    perguntas_adicionais = [x for x in dialogo if x.get("colinha_id") is None]
    print(f"Perguntas adicionais identificadas: {len(perguntas_adicionais)}")
    
    for idx, item in enumerate(dialogo):
        cid = item.get("colinha_id")
        tipo = item.get("tipo")
        p = item.get("pergunta") or item.get("texto") or ""
        r = item.get("resposta") or ""
        duv = item.get("duvidas") or []
        print(f"\nItem #{idx+1} [Colinha: {cid}] [Tipo: {tipo}]:")
        print(f"  P: {p}")
        print(f"  R: {r}")
        if duv:
            print(f"  Dúvidas: {duv}")

    # Salva relatório para inspeção detalhada
    Path("relatorio_teste_audio_longo.json").write_text(json.dumps(res_data, indent=2, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    test_avaliar_audio_longo_mp3()
