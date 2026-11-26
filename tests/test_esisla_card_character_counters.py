# -*- coding: utf-8 -*-
import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def test_gestao_atendimentos_char_counter():
    js_path = ROOT / "gestao_atendimentos.js"
    css_path = ROOT / "gestao_atendimentos.css"
    
    js = js_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")
    
    # Valida presença da função geradora de badge
    assert "function getEsislaCharCounterBadgeHtml(texto, limite = 2000)" in js
    assert "esisla-char-badge" in js
    assert "esisla-char-badge danger" in js
    
    # Valida que todos os blocos principais receberam o contador
    assert "${getEsislaCharCounterBadgeHtml(queixa)}" in js
    assert "${getEsislaCharCounterBadgeHtml(antecedentes)}" in js
    assert "${getEsislaCharCounterBadgeHtml(atestado)}" in js
    assert "${getEsislaCharCounterBadgeHtml(resumoVitais)}" in js
    assert "${getEsislaCharCounterBadgeHtml(exameFisicoLimpo)}" in js
    assert "${getEsislaCharCounterBadgeHtml(limitacoes)}" in js
    assert "${getEsislaCharCounterBadgeHtml(justif)}" in js
    
    # Valida CSS correspondente
    assert ".esisla-char-badge" in css
    assert ".esisla-char-badge.danger" in css
    assert "background: #FEE2E2 !important" in css
    assert "color: #DC2626 !important" in css

def test_gestao_medicos_char_counter():
    js_path = ROOT / "gestao_medicos.js"
    css_path = ROOT / "gestao_medicos.css"
    
    js = js_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")
    
    # Valida presença da função geradora de badge na visão médica
    assert "function getDoctorCharCountBadgeHtml(texto, limite = 2000)" in js
    assert "doc-esisla-char-badge" in js
    assert "doc-esisla-char-badge danger" in js
    assert "${getDoctorCharCountBadgeHtml(b.content)}" in js
    
    # Valida CSS correspondente
    assert ".doc-esisla-char-badge" in css
    assert ".doc-esisla-char-badge.danger" in css
    assert "background: #FEE2E2 !important" in css
    assert "color: #DC2626 !important" in css
