#!/usr/bin/env python3
"""Portable manifest/security/backup policy smoke test; no Android SDK needed."""
from pathlib import Path
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parent / "app/src/main"
A = "{http://schemas.android.com/apk/res/android}"
manifest = ET.parse(BASE / "AndroidManifest.xml").getroot()
app = manifest.find("application")
assert app is not None
assert app.get(A + "allowBackup") == "true"
for attribute, file in (
    ("networkSecurityConfig", "network_security_config.xml"),
    ("fullBackupContent", "backup_rules.xml"),
    ("dataExtractionRules", "data_extraction_rules.xml"),
):
    assert app.get(A + attribute) == "@xml/" + file.removesuffix(".xml"), attribute
    assert (BASE / "res/xml" / file).is_file(), file

network = ET.parse(BASE / "res/xml/network_security_config.xml").getroot()
assert network.tag == "network-security-config"
base = network.find("base-config")
assert base is not None and base.get("cleartextTrafficPermitted") == "false"
allowed = {}
for entry in network.findall("domain-config"):
    for domain in entry.findall("domain"):
        allowed[domain.text] = entry.get("cleartextTrafficPermitted")
assert allowed == {"localhost": "true", "127.0.0.1": "true"}, allowed

classic = ET.parse(BASE / "res/xml/backup_rules.xml").getroot()
assert classic.tag == "full-backup-content"
modern = ET.parse(BASE / "res/xml/data_extraction_rules.xml").getroot()
assert modern.tag == "data-extraction-rules"
for element in [classic, modern.find("cloud-backup"), modern.find("device-transfer")]:
    assert element is not None
    excluded = {(e.get("domain"), e.get("path")) for e in element.findall("exclude")}
    assert ("sharedpref", "storyweave_ai_keys.xml") in excluded, excluded

client = (BASE / "java/com/storyweave/app/data/ai/AiClient.kt").read_text(encoding="utf-8")
assert '"storyweave_ai_keys"' in client
print("PASS: manifest wiring, loopback-only HTTP, backup and device-transfer exclusions")
