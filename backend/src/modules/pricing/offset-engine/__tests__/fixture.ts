import { PricingData } from '../pricing-data';

/** Fixture PricingData rút gọn từ `báo giá/data/*.json` (giá trị thật) cho property/unit test. */
export function makePricingData(): PricingData {
    return {
        materials: [
            { code: 'C150', aliases: [], materialName: 'Coucher 150gsm (65x86) Hikote', type: 'Coucher', gsm: 150, priceVAT: 2029, priceNoVAT: 1878.7, sheetWidth: 65, sheetHeight: 86 },
            { code: 'C300', aliases: [], materialName: 'Coucher 300gsm (65x86) Hikote', type: 'Coucher', gsm: 300, priceVAT: 4058, priceNoVAT: 3757.4, sheetWidth: 65, sheetHeight: 86 },
            { code: 'D250', aliases: ['Duplex 250'], materialName: 'Duplex 250gsm (65x86) Hansol', type: 'Duplex', gsm: 250, priceVAT: 2390, priceNoVAT: 2212.96, sheetWidth: 65, sheetHeight: 86 },
            { code: 'B300', aliases: [], materialName: 'Britol 300gsm (65x86)', type: 'Britol', gsm: 300, priceVAT: 4528, priceNoVAT: 4192.59, sheetWidth: 65, sheetHeight: 86 },
            { code: 'I250', aliases: [], materialName: 'Ivory 250gsm (65x86) NIGHBO', type: 'Ivory', gsm: 250, priceVAT: 2923, priceNoVAT: 2706.48, sheetWidth: 65, sheetHeight: 86 },
        ],
        khoIn: [
            { khoIn: '43cm x 65cm', chiaTo: 'Chia 2', soConBaiIn: 2, soConToLon: 4, khoGiayLon: '65cm x 86cm', dienTichM2: 0.2795, loaiKem: 'Kẽm nhỏ' },
            { khoIn: '52cm x 72cm', chiaTo: 'Chia 2', soConBaiIn: 6, soConToLon: 12, khoGiayLon: '79cm x 109cm', dienTichM2: 0.3744, loaiKem: 'Kẽm nhỏ' },
            { khoIn: '36cm x 79cm', chiaTo: 'Chia 3', soConBaiIn: 3, soConToLon: 9, khoGiayLon: '79cm x 109cm', dienTichM2: 0.2844, loaiKem: 'Kẽm lớn' },
            { khoIn: '39.5cm x 54cm', chiaTo: 'Chia 4', soConBaiIn: 2, soConToLon: 8, khoGiayLon: '79cm x 109cm', dienTichM2: 0.2133, loaiKem: 'Kẽm nhỏ' },
            { khoIn: '28cm x 60cm', chiaTo: 'Chia 3', soConBaiIn: 2, soConToLon: 12, khoGiayLon: '84cm x 120cm', dienTichM2: 0.168, loaiKem: 'Kẽm nhỏ' },
        ],
        fixedSizes: {
            toRoi: [
                { kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)', khoIn: '43 x 65cm', khoGiayLon: '65 x 86cm', soConBaiIn: 8, soConToLon: 16 },
                { kichThuoc: '41cm x 29.7cm (tờ rơi, gấp giấy Coucher)', khoIn: '43 x 65cm', khoGiayLon: '65 x 86cm', soConBaiIn: 2, soConToLon: 4 },
            ],
            biThuFolder: [
                { kichThuoc: 'Bì thư 22 x 12 x nắp 3cm', khoIn: '39.5 x 54cm', khoGiayLon: '79 x 109cm', soConBaiIn: 2, soConKhoGiayLon: 8, loai: 'bithu' },
            ],
        },
        giaCong: [
            {
                code: 'XLBM', congDoan: 'Xử lý bề mặt', billingMode: 'minCharge', minChargeParam: 'GiaMin_XLBM', moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 250000 }, { min: 300, max: 500, price: 250000 }, { min: 500, max: 700, price: 250000 }, { min: 700, max: 1000, price: 250000 },
                    { min: 1000, max: 2000, price: 350 }, { min: 2000, max: 3000, price: 300 }, { min: 3000, max: 5000, price: 250 }, { min: 5000, max: 7000, price: 200 },
                    { min: 7000, max: 10000, price: 160 }, { min: 10000, max: 20000, price: 130 }, { min: 20000, max: 30000, price: 100 }, { min: 30000, max: 40000, price: 80 },
                    { min: 40000, max: 50000, price: 70 }, { min: 50000, max: 70000, price: 60 }, { min: 70000, max: 100000, price: 55 }, { min: 100000, max: null, price: 50 },
                ],
            },
            {
                code: 'CATXEN', congDoan: 'Cắt/xén', billingMode: 'perUnit', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 0 }, { min: 300, max: 500, price: 0 }, { min: 500, max: 700, price: 0 }, { min: 700, max: 1000, price: 0 },
                    { min: 1000, max: 2000, price: 70 }, { min: 2000, max: 3000, price: 65 }, { min: 3000, max: 5000, price: 60 }, { min: 5000, max: 7000, price: 55 },
                    { min: 7000, max: 10000, price: 50 }, { min: 10000, max: 20000, price: 45 }, { min: 20000, max: 30000, price: 40 }, { min: 30000, max: 40000, price: 35 },
                    { min: 40000, max: 50000, price: 30 }, { min: 50000, max: 70000, price: 25 }, { min: 70000, max: 100000, price: 20 }, { min: 100000, max: null, price: 15 },
                ],
            },
            {
                code: 'EPKIM', congDoan: 'ÉP KIM', billingMode: 'external', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [{ min: 0, max: null, price: 0 }],
            },
            {
                code: 'BE', congDoan: 'BẾ', billingMode: 'minCharge', minChargeParam: 'GiaMin_Be', moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 250000 }, { min: 300, max: 500, price: 250000 }, { min: 500, max: 700, price: 250000 }, { min: 700, max: 1000, price: 250000 },
                    { min: 1000, max: 2000, price: 350 }, { min: 2000, max: 3000, price: 300 }, { min: 3000, max: 5000, price: 250 }, { min: 5000, max: 7000, price: 200 },
                    { min: 7000, max: 10000, price: 160 }, { min: 10000, max: 20000, price: 130 }, { min: 20000, max: 30000, price: 100 }, { min: 30000, max: 40000, price: 80 },
                    { min: 40000, max: 50000, price: 70 }, { min: 50000, max: 70000, price: 60 }, { min: 70000, max: 100000, price: 55 }, { min: 100000, max: null, price: 50 },
                ],
            },
            {
                code: 'TP_TC', congDoan: 'TP Thủ công', billingMode: 'perUnit', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 300 }, { min: 300, max: 500, price: 300 }, { min: 500, max: 700, price: 300 }, { min: 700, max: 1000, price: 300 },
                    { min: 1000, max: 2000, price: 300 }, { min: 2000, max: 3000, price: 300 }, { min: 3000, max: 5000, price: 250 }, { min: 5000, max: 7000, price: 250 },
                    { min: 7000, max: 10000, price: 250 }, { min: 10000, max: 20000, price: 220 }, { min: 20000, max: 30000, price: 220 }, { min: 30000, max: 40000, price: 200 },
                    { min: 40000, max: 50000, price: 200 }, { min: 50000, max: 70000, price: 200 }, { min: 70000, max: 100000, price: 200 }, { min: 100000, max: null, price: 200 },
                ],
            },
            {
                code: 'TP_MAY', congDoan: 'TP Máy', billingMode: 'perUnit', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 150000 }, { min: 300, max: 500, price: 150000 }, { min: 500, max: 700, price: 150000 }, { min: 700, max: 1000, price: 150000 },
                    { min: 1000, max: 2000, price: 150 }, { min: 2000, max: 3000, price: 120 }, { min: 3000, max: 5000, price: 100 }, { min: 5000, max: 7000, price: 90 },
                    { min: 7000, max: 10000, price: 80 }, { min: 10000, max: 20000, price: 70 }, { min: 20000, max: 30000, price: 65 }, { min: 30000, max: 40000, price: 60 },
                    { min: 40000, max: 50000, price: 55 }, { min: 50000, max: 70000, price: 50 }, { min: 70000, max: 100000, price: 45 }, { min: 100000, max: null, price: 40 },
                ],
            },
            {
                code: 'DONGGOI', congDoan: 'ĐÓNG GÓI', billingMode: 'minCharge', minChargeParam: 'GiaMin_DongGoi', moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 100000 }, { min: 300, max: 500, price: 100000 }, { min: 500, max: 700, price: 100000 }, { min: 700, max: 1000, price: 100000 },
                    { min: 1000, max: 2000, price: 70 }, { min: 2000, max: 3000, price: 65 }, { min: 3000, max: 5000, price: 60 }, { min: 5000, max: 7000, price: 55 },
                    { min: 7000, max: 10000, price: 50 }, { min: 10000, max: 20000, price: 45 }, { min: 20000, max: 30000, price: 40 }, { min: 30000, max: 40000, price: 35 },
                    { min: 40000, max: 50000, price: 30 }, { min: 50000, max: 70000, price: 25 }, { min: 70000, max: 100000, price: 20 }, { min: 100000, max: null, price: 15 },
                ],
            },
            {
                code: 'DANTD', congDoan: 'DÁN HỘP TỰ ĐỘNG', billingMode: 'minCharge', minChargeParam: 'GiaMin_DanHop', moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 250000 }, { min: 300, max: 500, price: 250000 }, { min: 500, max: 700, price: 250000 }, { min: 700, max: 1000, price: 250000 },
                    { min: 1000, max: 2000, price: 350 }, { min: 2000, max: 3000, price: 300 }, { min: 3000, max: 5000, price: 250 }, { min: 5000, max: 7000, price: 200 },
                    { min: 7000, max: 10000, price: 160 }, { min: 10000, max: 20000, price: 130 }, { min: 20000, max: 30000, price: 100 }, { min: 30000, max: 40000, price: 80 },
                    { min: 40000, max: 50000, price: 70 }, { min: 50000, max: 70000, price: 60 }, { min: 70000, max: 100000, price: 55 }, { min: 100000, max: null, price: 50 },
                ],
            },
            {
                code: 'BOI', congDoan: 'BỒI', billingMode: 'perUnit', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 500000 }, { min: 300, max: 500, price: 500000 }, { min: 500, max: 700, price: 500000 }, { min: 700, max: 1000, price: 500000 },
                    { min: 1000, max: 2000, price: 950 }, { min: 2000, max: 3000, price: 900 }, { min: 3000, max: 5000, price: 880 }, { min: 5000, max: 7000, price: 800 },
                    { min: 7000, max: 10000, price: 770 }, { min: 10000, max: 20000, price: 700 }, { min: 20000, max: 30000, price: 660 }, { min: 30000, max: 40000, price: 600 },
                    { min: 40000, max: 50000, price: 550 }, { min: 50000, max: 70000, price: 500 }, { min: 70000, max: 100000, price: 450 }, { min: 100000, max: null, price: 400 },
                ],
            },
            {
                code: 'TP_TUI', congDoan: 'TP túi giấy', billingMode: 'perUnit', minChargeParam: null, moqParam: 'MOQ_GiaCong',
                tiers: [
                    { min: 0, max: 300, price: 2500 }, { min: 300, max: 500, price: 2500 }, { min: 500, max: 700, price: 2500 }, { min: 700, max: 1000, price: 2500 },
                    { min: 1000, max: 2000, price: 2150 }, { min: 2000, max: 3000, price: 2100 }, { min: 3000, max: 5000, price: 2050 }, { min: 5000, max: 7000, price: 2000 },
                    { min: 7000, max: 10000, price: 1950 }, { min: 10000, max: 20000, price: 1920 }, { min: 20000, max: 30000, price: 1900 }, { min: 30000, max: 40000, price: 1870 },
                    { min: 40000, max: 50000, price: 1850 }, { min: 50000, max: 70000, price: 1820 }, { min: 70000, max: 100000, price: 1800 }, { min: 100000, max: null, price: 1700 },
                ],
            },
        ],
        kem: {
            kemNho: [
                { soKem: 1, donGia: 500000 }, { soKem: 2, donGia: 600000 }, { soKem: 3, donGia: 700000 },
                { soKem: 4, donGia: 800000 }, { soKem: 5, donGia: 1000000 }, { soKem: 6, donGia: 1100000 },
            ],
            kemLon: [
                { soKem: 1, donGia: 1000000 }, { soKem: 2, donGia: 1200000 }, { soKem: 3, donGia: 1400000 },
                { soKem: 4, donGia: 1600000 }, { soKem: 5, donGia: 2000000 }, { soKem: 6, donGia: 2200000 },
            ],
            vatTuBeMat: [
                { ten: 'Không', donGiaKg: 0, soMat: null },
                { ten: 'Màng bóng 1m', donGiaKg: 1600, soMat: '1 mặt' },
                { ten: 'Màng bóng 2m', donGiaKg: 3200, soMat: '2 mặt' },
                { ten: 'Màng mờ 1m', donGiaKg: 1700, soMat: '1 mặt' },
                { ten: 'Màng mờ 2m', donGiaKg: 3400, soMat: '2 mặt' },
            ],
            donGia1Kem: { kemNho: 50000, kemLon: 100000 },
        },
        epKim: {
            tiers: ['Dưới 100', '100-499', '500-999', '>1000'],
            rows: [
                { viTri: '1 vị trí', duoi100: 200000, tu100_499: 1300, tu500_999: 1000, tren1000: 250 },
                { viTri: '2 vị trí', duoi100: 300000, tu100_499: 2000, tu500_999: 1800, tren1000: 500 },
                { viTri: '3 vị trí', duoi100: 400000, tu100_499: 2800, tu500_999: 2500, tren1000: 2200 },
            ],
        },
        tyLe: {
            haoHut: [
                { mocSoLuong: 1000, tyLe: 0.1 }, { mocSoLuong: 3000, tyLe: 0.08 }, { mocSoLuong: 4000, tyLe: 0.07 },
                { mocSoLuong: 5000, tyLe: 0.06 }, { mocSoLuong: 7000, tyLe: 0.05 }, { mocSoLuong: 20000, tyLe: 0.04 },
                { mocSoLuong: 50000, tyLe: 0.03 }, { mocSoLuong: 100000, tyLe: 0.02 }, { mocSoLuong: 999999, tyLe: 0.02 },
            ],
            params: {
                MOQ_GiaCong: 1000, MOQ_BinhBai_Nho: 3000, MOQ_BinhBai_Lon: 3000,
                GiaMin_XLBM: 250000, GiaMin_Be: 250000, GiaMin_DanHop: 250000, GiaMin_DongGoi: 100000,
                TyLe_VAT: 0.08, TyLe_ChietKhau: 0.05, TyLe_ChietKhau_Max: 0.1,
            },
            mocSoLuong: [1, 299, 499, 699, 999, 1999, 2999, 4999, 6999, 9999, 19999, 29999, 39999, 49999, 69999, 99999, 999999],
        },
        phiCoDinh: [
            { code: 'Gia_Khuon', ten: 'Phí khuôn bế (SP thường)', giaTri: 400000 },
            { code: 'Gia_Khuon_Hop', ten: 'Phí khuôn bế (hộp giấy)', giaTri: 500000 },
            { code: 'Gia_ThietKe', ten: 'Phí thiết kế mặc định', giaTri: 500000 },
        ],
    };
}
