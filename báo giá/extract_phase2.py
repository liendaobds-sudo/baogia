# -*- coding: utf-8 -*-
"""Phase 2: bóc bảng khổ cố định (TÍNH BÀI IN) + làm sạch danh mục chất liệu."""
import openpyxl, json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
F = r'Báo giá OFFSET v7.2 (chuan hoa).xlsx'
OUTDIR = 'data'
wb  = openpyxl.load_workbook(F, data_only=True)
wbf = openpyxl.load_workbook(F, data_only=False)

def save(name, obj):
    with open(os.path.join(OUTDIR, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    print(f"  -> {name}")

def norm(v):
    return str(v).strip() if isinstance(v, str) else v

# ---------- 9. TÍNH BÀI IN -> fixed_sizes.json ----------
ws  = wb['TÍNH BÀI IN']
wsf = wbf['TÍNH BÀI IN']

# Tờ rơi/letter: B(size) D(khoIn) E(khoGiayLon) F(soConBaiIn) G=F*mult
to_roi = []
for r in range(8, 16):
    size = norm(ws.cell(r, 2).value)
    if not size: continue
    f_val = ws.cell(r, 6).value
    g_formula = wsf.cell(r, 7).value or ''
    mult = 1
    m = re.search(r'\*\s*(\d+)', str(g_formula))
    if m: mult = int(m.group(1))
    to_roi.append({
        "kichThuoc": size,
        "khoIn": norm(ws.cell(r, 4).value),
        "khoGiayLon": norm(ws.cell(r, 5).value),
        "soConBaiIn": f_val,
        "soConToLon": (f_val * mult) if isinstance(f_val, (int, float)) else None,
    })

# Bì thư + folder: H(size) I(khoIn) J(khoGiayLon) K(soConBaiIn) L(soConKhoGiayLon)
bi_thu_folder = []
for r in range(8, 23):
    size = norm(ws.cell(r, 8).value)
    if not size: continue
    bi_thu_folder.append({
        "kichThuoc": size,
        "khoIn": norm(ws.cell(r, 9).value),
        "khoGiayLon": norm(ws.cell(r, 10).value),
        "soConBaiIn": ws.cell(r, 11).value,
        "soConKhoGiayLon": ws.cell(r, 12).value,
        "loai": "folder" if size.lower().startswith("folder") else "bithu",
    })

fixed = {"toRoi": to_roi, "biThuFolder": bi_thu_folder}
save('fixed_sizes.json', fixed)
print(f"     toRoi={len(to_roi)}, biThuFolder={len(bi_thu_folder)}")

# ---------- 10. materials_clean.json: gộp alias, parse gsm ----------
materials = json.load(open(os.path.join(OUTDIR, 'materials.json'), encoding='utf-8'))
by_name = {}
order = []
for m in materials:
    key = m['materialName']
    if key not in by_name:
        by_name[key] = {"codes": [], **m}
        order.append(key)
    by_name[key]["codes"].append(m['code'])

clean = []
for key in order:
    g = by_name[key]
    codes = g['codes']
    # canonical = mã ngắn nhất không chứa khoảng trắng (vd 'D250' thay vì 'Duplex 250')
    canonical = sorted(codes, key=lambda c: (' ' in c, len(c)))[0]
    aliases = [c for c in codes if c != canonical]
    gsm = None
    mg = re.search(r'(\d+)\s*g', key, re.I)
    if mg: gsm = int(mg.group(1))
    clean.append({
        "code": canonical,
        "aliases": aliases,
        "materialName": key,
        "type": g['type'],
        "gsm": gsm,
        "priceVAT": g['priceVAT'],
        "priceNoVAT": g['priceNoVAT'],
        "sheetWidth": g['width'],
        "sheetHeight": g['height'],
    })
save('materials_clean.json', clean)
print(f"     {len(clean)} vật liệu (gộp {len(materials)-len(clean)} alias)")

print("Done phase 2.")
