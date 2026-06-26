# -*- coding: utf-8 -*-
"""Bóc dữ liệu gốc từ Excel báo giá -> JSON sạch cho web app (Next.js)."""
import openpyxl, json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SRC = r'Báo giá OFFSET v7.2 (chuan hoa).xlsx'   # bản đã chuẩn hóa
PRICED = r'Báo giá OFFSET v7.2 (chuan hoa).xlsx'  # đọc cùng file để giá & tên khớp nhau
OUTDIR = 'data'
os.makedirs(OUTDIR, exist_ok=True)

wb  = openpyxl.load_workbook(SRC, data_only=True)
wbp = openpyxl.load_workbook(PRICED, data_only=True)

def cell(ws, r, c): return ws.cell(r, c).value
def save(name, obj):
    p = os.path.join(OUTDIR, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    print(f"  -> {p}  ({len(obj) if isinstance(obj,list) else 'object'})")

# ---------- 1. DM_VatTu: bảng giá vật tư gốc ----------
vt = wbp['DM_VatTu']
vat_tu = []
price_by_name = {}
for r in range(2, vt.max_row + 1):
    name = cell(vt, r, 1)
    if not name: continue
    rec = {
        "name": str(name).strip(),
        "width": cell(vt, r, 2),
        "height": cell(vt, r, 3),
        "priceVAT": cell(vt, r, 4),
        "priceNoVAT": cell(vt, r, 5),
    }
    vat_tu.append(rec)
    price_by_name[rec["name"]] = rec
save('vat_tu.json', vat_tu)

# ---------- 2. DM_MaChatLieu: mã chất liệu -> giá (resolved) ----------
mc = wb['DM_MaChatLieu']
materials = []
for r in range(2, mc.max_row + 1):
    code = cell(mc, r, 1)
    if not code: continue
    name = (cell(mc, r, 2) or '').strip()
    p = price_by_name.get(name, {})
    materials.append({
        "code": str(code).strip(),
        "materialName": name,
        "type": cell(mc, r, 3),
        "priceVAT": p.get("priceVAT"),
        "priceNoVAT": p.get("priceNoVAT"),
        "width": p.get("width"),
        "height": p.get("height"),
    })
save('materials.json', materials)

# ---------- 3. DM_KhoIn: khổ in ----------
kho = wb['DM_KhoIn']
kho_in = []
for r in range(2, kho.max_row + 1):
    if not cell(kho, r, 1): continue
    kho_in.append({
        "khoIn": str(cell(kho, r, 1)).strip(),
        "chiaTo": cell(kho, r, 2),
        "soConBaiIn": cell(kho, r, 3),
        "soConToLon": cell(kho, r, 4),
        "khoGiayLon": cell(kho, r, 5),
        "dienTichM2": cell(kho, r, 6),
        "loaiKem": cell(kho, r, 7),
    })
save('kho_in.json', kho_in)

# ---------- 4. DM_EpKim: giá ép kim theo vị trí & số lượng ----------
ek = wbp['DM_EpKim']
ep_kim = {"tiers": [], "rows": []}
ep_kim["tiers"] = [cell(ek,1,c) for c in range(2,6)]  # Dưới 100,100-499,500-999,>1000
for r in range(2, ek.max_row + 1):
    pos = cell(ek, r, 1)
    if not pos: continue
    ep_kim["rows"].append({
        "viTri": pos,
        "duoi100": cell(ek, r, 2),
        "tu100_499": cell(ek, r, 3),
        "tu500_999": cell(ek, r, 4),
        "tren1000": cell(ek, r, 5),
    })
save('ep_kim.json', ep_kim)

print("Done phần 1-4.")

# ---------- 5. DM_GiaCong: giá gia công theo bậc số lượng ----------
gc = wbp['DM_GiaCong']
# Bậc số lượng ứng với cột D..S
brackets = [
    (0,300),(300,500),(500,700),(700,1000),(1000,2000),(2000,3000),
    (3000,5000),(5000,7000),(7000,10000),(10000,20000),(20000,30000),
    (30000,40000),(40000,50000),(50000,70000),(70000,100000),(100000,None)
]
gia_cong = []
for r in range(2, 16):  # 14 công đoạn
    code = cell(gc, r, 20)  # cột T = Ma_Lookup
    if not code: continue
    tiers = []
    for i, (lo, hi) in enumerate(brackets):
        price = cell(gc, r, 4 + i)  # D = col 4
        tiers.append({"min": lo, "max": hi, "price": price})
    gia_cong.append({
        "code": str(code).strip(),
        "congDoan": (cell(gc, r, 2) or '').strip(),
        "ghiChu": cell(gc, r, 3),
        "tiers": tiers,
    })
save('gia_cong.json', gia_cong)

# ---------- 6. DM_Kem: kẽm + vật tư bề mặt ----------
km = wbp['DM_Kem']
# Bảng giá kẽm nhỏ (A3:B8) & kẽm lớn (E3:F8)
kem_nho = []
kem_lon = []
for r in range(3, 9):
    if cell(km, r, 1) is not None:
        kem_nho.append({"soKem": cell(km, r, 1), "donGia": cell(km, r, 2)})
    if cell(km, r, 5) is not None:
        kem_lon.append({"soKem": cell(km, r, 5), "donGia": cell(km, r, 6)})
# Vật tư bề mặt (A13:C21)
vat_tu_be_mat = []
for r in range(13, 22):
    name = cell(km, r, 1)
    if name is None: continue
    vat_tu_be_mat.append({
        "ten": str(name).strip(),
        "donGiaKg": cell(km, r, 2),
        "soMat": cell(km, r, 3),
    })
# Đơn giá 1 kẽm (E13:F14)
don_gia_1_kem = {
    "kemNho": cell(km, 13, 6),
    "kemLon": cell(km, 14, 6),
}
kem = {
    "kemNho": kem_nho,
    "kemLon": kem_lon,
    "vatTuBeMat": vat_tu_be_mat,
    "donGia1Kem": don_gia_1_kem,
}
save('kem.json', kem)

# ---------- 7. DM_TyLe: hao hụt, MOQ, VAT, chiết khấu, mốc SL ----------
ty = wbp['DM_TyLe']
# Hao hụt theo mốc (I2:J10)
hao_hut = []
for r in range(2, 11):
    moc = cell(ty, r, 9)
    if moc is None: continue
    hao_hut.append({"mocSoLuong": moc, "tyLe": cell(ty, r, 10)})
# Tham số ngưỡng (D10:E19)
params = {}
for r in range(10, 20):
    k = cell(ty, r, 4); v = cell(ty, r, 5)
    if k: params[str(k).strip()] = v
# Mốc số lượng cho LOOKUP (B21:B37)
moc_so_luong = []
for r in range(21, 38):
    v = cell(ty, r, 2)
    if v is not None: moc_so_luong.append(v)
ty_le = {
    "haoHut": hao_hut,
    "params": params,         # MOQ_GiaCong, MOQ_BinhBai_*, GiaMin_*, TyLe_VAT, TyLe_ChietKhau(_Max)
    "mocSoLuong": moc_so_luong,
}
save('ty_le.json', ty_le)

# ---------- 8. DM_PhiCoDinh ----------
pc = wbp['DM_PhiCoDinh']
phi = []
for r in range(2, pc.max_row + 1):
    code = cell(pc, r, 1)
    if not code: continue
    phi.append({
        "code": str(code).strip(),
        "ten": cell(pc, r, 2),
        "giaTri": cell(pc, r, 3),
        "ghiChu": cell(pc, r, 4),
    })
save('phi_co_dinh.json', phi)

print("Done phần 5-8. Hoàn tất bóc dữ liệu gốc.")
