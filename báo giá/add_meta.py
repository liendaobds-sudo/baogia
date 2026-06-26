# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = os.path.join('data', 'gia_cong.json')
gc = json.load(open(p, encoding='utf-8'))

# Quy tắc tính tiền theo công đoạn (suy ra từ công thức các sheet báo giá):
#  - minCharge: khi SL < MOQ_GiaCong dùng giá tối thiểu (param); >= MOQ tính đơn giá/cái × SL
#  - perUnit  : luôn tính đơn giá/cái × SL (tra bậc theo SL)
#  - external : KHÔNG dùng bảng này (ép kim tính từ DM_EpKim)
meta = {
    "XLBM":     ("minCharge", "GiaMin_XLBM"),
    "BOI":      ("perUnit",   None),
    "EPKIM":    ("external",  None),   # ép kim tính từ ep_kim.json (DM_EpKim)
    "BE":       ("minCharge", "GiaMin_Be"),
    "DANTD":    ("minCharge", "GiaMin_DanHop"),
    "QC":       ("perUnit",   None),
    "DONGGOI":  ("minCharge", "GiaMin_DongGoi"),
    "CATXEN":   ("perUnit",   None),
    "TP_TC":    ("perUnit",   None),
    "TP_TUI":   ("perUnit",   None),
    "TP_MAY":   ("perUnit",   None),
    "TP_CUON":  ("perUnit",   None),
    "TP_LOXO":  ("perUnit",   None),
    "TP_DUCKEO":("perUnit",   None),
}
for rec in gc:
    mode, param = meta.get(rec['code'], ("perUnit", None))
    rec['billingMode'] = mode
    rec['minChargeParam'] = param
    rec['moqParam'] = "MOQ_GiaCong"

with open(p, 'w', encoding='utf-8') as f:
    json.dump(gc, f, ensure_ascii=False, indent=2)
print("Đã gắn billingMode cho", len(gc), "công đoạn:")
for rec in gc:
    print(f"   {rec['code']:10} {rec['billingMode']:10} min={rec['minChargeParam']}")
