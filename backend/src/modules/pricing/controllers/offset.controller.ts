import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OffsetMasterDataService } from '../services/offset-master-data.service';
import { EngineOffsetService, OffsetEngineInput } from '../offset-engine/engine-offset.service';
import { ConfigStore } from '../offset-engine/config-store.service';
import { TUI_NEST_OPTIONS, buildTuiOptions } from '../offset-engine/products/tui-giay';
import { flatDielineSize, generateDieline, nestOnSheet, nestRectOnSheet, SUPPORTED_BOX_TYPES, BoxType, DEFAULT_NESTING_CONFIG } from '../dieline';
import { buildFlatShape, FlatShape } from '../dieline';
import { docKichThuocCm } from '../offset-engine/lookups';
import { computeBoundingBox } from '../dieline/utils';
import { buildPanelFillPaths, buildDielineFill } from '../dieline/panel-fill';

/**
 * OffsetController — API endpoints cho In Offset
 * Prefix: /pricing/offset
 *
 * HOÀN TOÀN ĐỘC LẬP — không ảnh hưởng /pricing/calculate hay /pricing/master-data hiện tại.
 *
 * Engine tính giá DUY NHẤT là `EngineOffset` (mô hình bù hao theo công đoạn, dữ liệu cấu hình DB/JSON, đã khớp golden).
 * Engine cũ (machine/imposition) đã được gỡ sau khi 5 golden + 10 property test khớp (Req 21).
 */
@Controller('pricing/offset')
export class OffsetController {

    constructor(
        private readonly masterData: OffsetMasterDataService,
        private readonly engineNew: EngineOffsetService,
        private readonly configStore: ConfigStore,
    ) {}

    // ═══ Tính giá ═══

    @Post('calculate')
    async calculate(@Body() body: any) {
        // Engine duy nhất: định tuyến theo `type` ∈ {to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}.
        // Type không hợp lệ → EngineOffset trả success=false kèm thông báo lỗi.
        return this.engineNew.calculate(body as OffsetEngineInput);
    }

    // ═══ Khuôn bế (dieline) — khổ trải + xếp bài ═══

    /**
     * Tính KHỔ TRẢI của một khuôn bế (hộp/bao bì chuẩn) + số con/tờ trên từng khổ giấy offset.
     * Phục vụ preview xếp bài + nâng cấp độ chính xác con/tờ cho báo giá hộp.
     * Body: { boxType, rong(L), hong(W), cao(D), T? }.
     */
    @Post('dieline')
    @UseGuards(AuthGuard('jwt'))
    async dieline(@Body() body: { boxType?: string; rong?: number; hong?: number; cao?: number; T?: number; mi?: number; handleHoles?: boolean; mieng?: string; itemW?: number; itemH?: number; flatShape?: FlatShape; envFlapShape?: string; envStyle?: string; nestMode?: 'smart' | 'grid' }) {
        const boxType = body?.boxType as BoxType;
        const isBox = !!boxType && SUPPORTED_BOX_TYPES.includes(boxType);

        // Dữ liệu khuôn để vẽ: khuôn thật (box/túi) hoặc khuôn cắt phẳng (chữ nhật).
        let flat: { widthCm: number; heightCm: number; standardCode: string; warnings: string[] };
        let paths: any[];
        let contourD: string;
        let bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
        let params: any = null;

        if (isBox) {
            if (boxType === 'envelope') {
                // Bì thư: tham số riêng (envW/envH + dạng nắp + kiểu) — không theo L/W/D.
                params = {
                    boxType: 'envelope',
                    envW: (Number(body.rong) || 0) * 10,
                    envH: (Number(body.cao) || 0) * 10,
                    envFlapShape: (body.envFlapShape as any) || 'pointed',
                    envStyle: (body.envStyle as any) || 'wallet',
                    T: Number(body.T) || 0.5,
                };
            } else if (boxType === 'paper_bag') {
                // Túi giấy SOS: cấu trúc thực — mí gập miệng (TH) + loại quai (lỗ xỏ ↔ dán).
                //  • mieng='khong' → không gập miệng (TH=0); ngược lại lấy mí (cm→mm), mặc định 15mm.
                //  • handleHoles=true → quai lỗ xỏ (đục lỗ); false → quai dán (không đục lỗ).
                params = {
                    boxType: 'paper_bag',
                    L: (Number(body.rong) || 0) * 10,
                    W: (Number(body.hong) || 0) * 10,
                    D: (Number(body.cao) || 0) * 10,
                    T: Number(body.T) || 0.5,
                    TH: body.mieng === 'khong' ? 0 : (Number(body.mi) > 0 ? Number(body.mi) * 10 : 15),
                    handleHoles: body.handleHoles !== undefined ? !!body.handleHoles : true,
                };
            } else {
                params = {
                    boxType,
                    L: (Number(body.rong) || 0) * 10,
                    W: (Number(body.hong) || 0) * 10,
                    D: (Number(body.cao) || 0) * 10,
                    T: Number(body.T) || 0.5,
                };
            }
            let model;
            try {
                const fd = flatDielineSize(params);
                flat = { widthCm: fd.widthCm, heightCm: fd.heightCm, standardCode: fd.standardCode, warnings: fd.warnings };
                model = generateDieline(params);
            } catch (e: any) {
                return { success: false, error: e?.message || 'Không sinh được khuôn bế' };
            }
            paths = model.allPaths.map((seg) => ({ tag: seg.tag, type: seg.type, points: seg.points, controlPoints: seg.controlPoints }));
            // Tô nền theo từng panel (giống hệt NestingCanvas của web) + fillRule evenodd ở FE.
            // Túi giấy SOS: thân túi nằm trong panels nhưng ĐÁY gập + mí miệng chỉ ở allPaths → panel-fill
            // bỏ trống đáy. Dùng đường bao ngoài (silhouette) để tô đầy đủ cả đáy; fallback panel-fill.
            contourD = boxType === 'paper_bag'
                ? (buildDielineFill(model.allPaths) || buildPanelFillPaths(model.panels))
                : buildPanelFillPaths(model.panels);
            bbox = {
                minX: model.boundingBox.minX, minY: model.boundingBox.minY,
                maxX: model.boundingBox.maxX, maxY: model.boundingBox.maxY,
                width: model.boundingBox.width, height: model.boundingBox.height,
            };
        } else {
            // Khuôn PHẲNG: chữ nhật (tờ rơi/SP khác), bì thư hoặc folder — kèm nắp gấp + đường cấn.
            const wmm = (Number(body.itemW) || 0) * 10;
            const hmm = (Number(body.itemH) || 0) * 10;
            if (!(wmm > 0 && hmm > 0)) {
                return { success: false, error: 'Cần boxType hợp lệ HOẶC itemW/itemH > 0' };
            }
            const shape = (body.flatShape as FlatShape) || 'rect';
            const fs = buildFlatShape(shape, wmm, hmm);
            flat = { widthCm: fs.bbox.width / 10, heightCm: fs.bbox.height / 10, standardCode: fs.standardCode, warnings: [] };
            paths = fs.paths;
            contourD = fs.contourD;
            bbox = fs.bbox;
        }

        // Dàn khuôn lên TỪNG khổ in offset → số con + vị trí.
        // Chế độ xếp: 'smart' (xếp tối ưu, xoay/cài răng lược) | 'grid' (lưới đều). Mặc định: box=smart, phẳng=grid.
        const nestMode: 'smart' | 'grid' = body.nestMode === 'grid' || body.nestMode === 'smart' ? body.nestMode : (isBox ? 'smart' : 'grid');
        const d = await this.configStore.loadPricingData();
        const sheets = d.khoIn
            .map((k) => {
                const sm = docKichThuocCm(k.khoIn);
                if (!sm || sm.w <= 0 || sm.h <= 0) return null;
                const nest = isBox
                    ? nestOnSheet(params, sm.w * 10, sm.h * 10, { nestingMode: nestMode })
                    : nestRectOnSheet(bbox.width, bbox.height, sm.w * 10, sm.h * 10, { nestingMode: nestMode });
                return {
                    khoIn: k.khoIn,
                    khoGiayLon: k.khoGiayLon,
                    loaiKem: k.loaiKem,
                    sheetWmm: nest.actualSheet.width,
                    sheetHmm: nest.actualSheet.height,
                    countPerSheet: nest.countPerSheet,
                    utilization: nest.utilization,
                    label: nest.label,
                    positions: nest.positions,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => b.countPerSheet - a.countPerSheet);

        const nestCfg = { margin: DEFAULT_NESTING_CONFIG.margin, gripperMargin: DEFAULT_NESTING_CONFIG.gripperMargin };
        return { success: true, data: { boxType: isBox ? boxType : null, flat, paths, contourD, bbox, sheets, config: nestCfg } };
    }

    /** Danh sách loại khuôn bế hỗ trợ (cho dropdown). */
    @Get('dieline/types')
    async dielineTypes() {
        const labels: Record<string, string> = {
            rte: 'Hộp nắp gài so le (RTE)',
            slb: 'Hộp đáy gài tự động (Snap-Lock)',
            gable: 'Hộp quai xách (Gable)',
            paper_bag: 'Túi giấy SOS',
            cup_sleeve: 'Bọc ly (Cup Sleeve)',
            mailer: 'Hộp Mailer (FEFCO 0427)',
            pizza: 'Hộp Pizza (FEFCO 0426)',
            envelope: 'Bì thư (Wallet/Pocket)',
            tray: 'Hộp diêm / Khay (FEFCO 0410)',
        };
        return { success: true, data: SUPPORTED_BOX_TYPES.map((id) => ({ id, label: labels[id] || id })) };
    }

    // ═══ Master Data (dropdown) ═══

    @Get('master-data')
    async getMasterData() {
        const data = await this.masterData.getAllMasterData();
        return { success: true, data };
    }

    // ═══ Bảng giá mới (EngineOffset) — cấu hình cho 5 form Configurator ═══

    /**
     * Trả toàn bộ PricingData hiện hành (DB hoặc mặc định JSON) để frontend đổ dropdown
     * cho 5 loại sản phẩm offset mới. _Requirements: 18.1, 19.1_
     */
    @Get('pricebook')
    async getPricebook() {
        // Nạp lại cấu hình từ DB (gồm giấy in scope_offset ở bảng materials) để Configurator
        // và lần tính kế tiếp luôn dùng giá mới nhất admin vừa sửa.
        await this.engineNew.refreshFromConfigStore();
        const d = await this.configStore.loadPricingData();
        return {
            success: true,
            data: {
                materials: d.materials,
                khoIn: d.khoIn,
                fixedSizes: d.fixedSizes,
                giaCong: d.giaCong,
                vatTuBeMat: d.kem.vatTuBeMat,
                kem: { kemNho: d.kem.kemNho, kemLon: d.kem.kemLon, donGia1Kem: d.kem.donGia1Kem },
                epKim: d.epKim,
                haoHut: d.tyLe.haoHut,
                params: d.tyLe.params,
                mocSoLuong: d.tyLe.mocSoLuong,
                phiCoDinh: d.phiCoDinh,
                // Cấu hình form theo loại sản phẩm (whitelist/mặc định/ẩn/khoá). Frontend đọc để tối giản form.
                productConfig: d.productConfig ?? {},
                // Bảng "bài in" túi: sinh ĐỘNG từ khổ giấy cấu hình (fallback bảng tĩnh nếu chưa có khổ).
                tuiBaiIn: (() => { const dyn = buildTuiOptions(d); return (dyn.length ? dyn : TUI_NEST_OPTIONS).map((o) => o.label); })(),
                // Kiểu in: số màu (= số bản kẽm). Nguồn ở backend để FE dựng dropdown "Kiểu in".
                soMauOptions: [1, 2, 4, 5, 6],
            },
        };
    }

    /** Seed lại cấu hình mặc định (idempotent) + làm mới cache engine. */
    @Post('pricebook/seed')
    @UseGuards(AuthGuard('jwt'))
    async seedPricebook() {
        const res = await this.configStore.seedDefaults();
        await this.engineNew.refreshFromConfigStore();
        return { success: res.seeded, ...res };
    }

    // ═══ CRUD admin cấu hình bảng giá mới (Req 18.2–18.4) ═══

    private async afterWrite() {
        // Làm mới cache PricingData để lần tính kế tiếp phản ánh thay đổi.
        await this.engineNew.refreshFromConfigStore();
    }

    @Post('cfg/kho-in')
    @UseGuards(AuthGuard('jwt'))
    async upsertKhoIn(@Body() body: any) {
        await this.configStore.upsertKhoIn(body);
        await this.afterWrite();
        return { success: true };
    }
    @Delete('cfg/kho-in/:khoIn')
    @UseGuards(AuthGuard('jwt'))
    async deleteKhoIn(@Param('khoIn') khoIn: string) {
        await this.configStore.deleteKhoIn(khoIn);
        await this.afterWrite();
        return { success: true };
    }

    @Post('cfg/vat-tu-be-mat')
    @UseGuards(AuthGuard('jwt'))
    async upsertVatTuBeMat(@Body() body: any) {
        await this.configStore.upsertVatTuBeMat(body);
        await this.afterWrite();
        return { success: true };
    }
    @Delete('cfg/vat-tu-be-mat/:ten')
    @UseGuards(AuthGuard('jwt'))
    async deleteVatTuBeMat(@Param('ten') ten: string) {
        await this.configStore.deleteVatTuBeMat(ten);
        await this.afterWrite();
        return { success: true };
    }

    @Post('cfg/ep-kim')
    @UseGuards(AuthGuard('jwt'))
    async upsertEpKim(@Body() body: any) {
        await this.configStore.upsertEpKim(body);
        await this.afterWrite();
        return { success: true };
    }
    @Delete('cfg/ep-kim/:viTri')
    @UseGuards(AuthGuard('jwt'))
    async deleteEpKim(@Param('viTri') viTri: string) {
        await this.configStore.deleteEpKim(viTri);
        await this.afterWrite();
        return { success: true };
    }

    @Post('cfg/fixed-size')
    @UseGuards(AuthGuard('jwt'))
    async upsertFixedSize(@Body() body: { nhom: 'to_roi' | 'bi_thu_folder'; [k: string]: any }) {
        await this.configStore.upsertFixedSize(body.nhom, body);
        await this.afterWrite();
        return { success: true };
    }
    @Delete('cfg/fixed-size/:id')
    @UseGuards(AuthGuard('jwt'))
    async deleteFixedSize(@Param('id') id: string) {
        await this.configStore.deleteFixedSize(parseInt(id, 10));
        await this.afterWrite();
        return { success: true };
    }

    @Post('cfg/kem')
    @UseGuards(AuthGuard('jwt'))
    async upsertKem(@Body() body: { bang: 'kemNho' | 'kemLon'; soKem: number; donGia: number }) {
        await this.configStore.upsertKem(body.bang, Number(body.soKem), Number(body.donGia));
        await this.afterWrite();
        return { success: true };
    }
    @Delete('cfg/kem/:bang/:soKem')
    @UseGuards(AuthGuard('jwt'))
    async deleteKem(@Param('bang') bang: 'kemNho' | 'kemLon', @Param('soKem') soKem: string) {
        await this.configStore.deleteKem(bang, parseInt(soKem, 10));
        await this.afterWrite();
        return { success: true };
    }

    // ═══ Định mức BÙ HAO THEO CÔNG ĐOẠN — MỖI công đoạn 1 bảng mốc RIÊNG ═══
    // Lưu JSON 'offset.WasteStages'. Rate lưu phân số 0..1; API trao đổi bằng % cho dễ nhập.

    private static readonly STAGES: { code: string; basis: 'sheet' | 'piece'; label: string; hasMakeready: boolean; makereadyUnit: string }[] = [
        { code: 'IN', basis: 'sheet', label: 'In (chạy máy)', hasMakeready: true, makereadyUnit: 'tờ' },
        { code: 'CAN', basis: 'sheet', label: 'Cán màng', hasMakeready: false, makereadyUnit: 'tờ' },
        { code: 'XLBM', basis: 'piece', label: 'Xử lý bề mặt (XLBM)', hasMakeready: false, makereadyUnit: 'con' },
        { code: 'BE', basis: 'piece', label: 'Bế', hasMakeready: true, makereadyUnit: 'con' },
        { code: 'DAN', basis: 'piece', label: 'Dán hộp / dán nối', hasMakeready: false, makereadyUnit: 'con' },
        { code: 'TP', basis: 'piece', label: 'Thành phẩm (gấp/bắt)', hasMakeready: false, makereadyUnit: 'con' },
        { code: 'CATXEN', basis: 'piece', label: 'Cắt / xén', hasMakeready: false, makereadyUnit: 'con' },
        { code: 'DONGGOI', basis: 'piece', label: 'Đóng gói', hasMakeready: false, makereadyUnit: 'con' },
    ];

    @Get('cfg/waste-stages')
    async getWasteStages() {
        const d = await this.configStore.loadPricingData();
        const stored = d.wasteStages || {};
        // Đường cong haoHut hiện hành — dùng làm GỢI Ý mặc định cho IN khi IN chưa có bảng riêng.
        const inDefaultTiers = [...d.tyLe.haoHut]
            .sort((a, b) => a.mocSoLuong - b.mocSoLuong)
            .map((r) => ({ from: r.mocSoLuong, percent: Math.round(r.tyLe * 1000) / 10 }));

        const stages = OffsetController.STAGES.map((s) => {
            const cfg = stored[s.code];
            const tiers = cfg?.tiers?.length
                ? [...cfg.tiers].sort((a, b) => a.from - b.from).map((t) => ({ from: t.from, percent: Math.round(t.rate * 1000) / 10 }))
                : (s.code === 'IN' ? inDefaultTiers : []);
            const makeready = cfg && Number.isFinite(cfg.makeready) ? cfg.makeready : (s.code === 'IN' ? 100 : 0);
            const basis = cfg?.basis === 'sheet' || cfg?.basis === 'piece' ? cfg.basis : s.basis;
            return { code: s.code, basis, defaultBasis: s.basis, label: s.label, hasMakeready: s.hasMakeready, makereadyUnit: s.makereadyUnit, makeready, tiers };
        });
        return { success: true, data: { stages } };
    }

    @Post('cfg/waste-stages')
    @UseGuards(AuthGuard('jwt'))
    async saveWasteStages(@Body() body: { stages: { code: string; basis?: 'sheet' | 'piece'; makeready?: number; tiers?: { from: number; percent: number }[] }[] }) {
        const out: Record<string, { basis?: 'sheet' | 'piece'; makeready: number; tiers: { from: number; rate: number }[] }> = {};
        const byCode = new Map(OffsetController.STAGES.map((s) => [s.code, s]));
        for (const s of body?.stages || []) {
            const meta = byCode.get(s.code);
            if (!meta) continue;
            const tiers = (s.tiers || [])
                .filter((t) => Number.isFinite(t.from) && Number.isFinite(t.percent) && t.from > 0)
                .sort((a, b) => a.from - b.from)
                .map((t) => ({ from: Math.round(t.from), rate: t.percent / 100 }));
            // Chỉ lưu basis khi khác mặc định (gọn JSON); engine tự dùng mặc định nếu thiếu.
            const basis = (s.basis === 'sheet' || s.basis === 'piece') && s.basis !== meta.basis ? s.basis : undefined;
            out[s.code] = { ...(basis ? { basis } : {}), makeready: Number.isFinite(Number(s.makeready)) ? Math.round(Number(s.makeready)) : 0, tiers };
        }
        await this.configStore.saveWasteStages(out);
        await this.afterWrite();
        return { success: true };
    }

    @Post('cfg/param')
    @UseGuards(AuthGuard('jwt'))
    async upsertParam(@Body() body: { key: string; value: number }) {
        await this.configStore.upsertParam(body.key, Number(body.value));
        await this.afterWrite();
        return { success: true };
    }

    @Delete('cfg/param/:key')
    @UseGuards(AuthGuard('jwt'))
    async deleteParam(@Param('key') key: string) {
        await this.configStore.deleteParam(key);
        await this.afterWrite();
        return { success: true };
    }

    // ═══ Phí cố định (khuôn/thiết kế) + Chiết khấu — đều cấu hình được, không gán cứng ═══

    private static readonly FEE_CODES = [
        { code: 'Gia_Khuon', ten: 'Phí khuôn bế (SP thường)' },
        { code: 'Gia_Khuon_Hop', ten: 'Phí khuôn bế (hộp giấy)' },
        { code: 'Gia_ThietKe', ten: 'Phí thiết kế mặc định' },
    ];

    @Get('cfg/fees')
    async getFees() {
        const d = await this.configStore.loadPricingData();
        const byCode = new Map(d.phiCoDinh.map((p) => [p.code, p]));
        const fees = OffsetController.FEE_CODES.map((f) => ({
            code: f.code,
            ten: byCode.get(f.code)?.ten ?? f.ten,
            giaTri: byCode.get(f.code)?.giaTri ?? 0,
        }));
        return {
            success: true,
            data: {
                fees,
                chietKhauDefault: Math.round((d.tyLe.params.TyLe_ChietKhau ?? 0) * 1000) / 10, // %
                chietKhauMax: Math.round((d.tyLe.params.TyLe_ChietKhau_Max ?? 0) * 1000) / 10, // %
                mocSoLuong: d.tyLe.mocSoLuong, // mốc số lượng bậc giá (cấu hình được)
                epKimMoc: {
                    m1: d.tyLe.params.EpKim_Moc1 || 100,
                    m2: d.tyLe.params.EpKim_Moc2 || 500,
                    m3: d.tyLe.params.EpKim_Moc3 || 1000,
                },
            },
        };
    }

    @Post('cfg/fees')
    @UseGuards(AuthGuard('jwt'))
    async saveFees(@Body() body: { fees?: { code: string; ten?: string; giaTri: number }[]; chietKhauDefault?: number; chietKhauMax?: number; mocSoLuong?: number[]; epKimMoc?: { m1?: number; m2?: number; m3?: number } }) {
        const valid = new Set(OffsetController.FEE_CODES.map((f) => f.code));
        for (const f of body?.fees || []) {
            if (!valid.has(f.code) || !Number.isFinite(Number(f.giaTri))) continue;
            const ten = f.ten || OffsetController.FEE_CODES.find((x) => x.code === f.code)!.ten;
            await this.configStore.upsertPhiCoDinh(f.code, ten, Math.round(Number(f.giaTri)));
        }
        // Chiết khấu nhập % → lưu phân số.
        if (Number.isFinite(Number(body?.chietKhauDefault))) {
            await this.configStore.upsertParam('TyLe_ChietKhau', Number(body!.chietKhauDefault) / 100);
        }
        if (Number.isFinite(Number(body?.chietKhauMax))) {
            await this.configStore.upsertParam('TyLe_ChietKhau_Max', Number(body!.chietKhauMax) / 100);
        }
        if (Array.isArray(body?.mocSoLuong) && body!.mocSoLuong!.length) {
            await this.configStore.saveMocSoLuong(body!.mocSoLuong!);
        }
        if (body?.epKimMoc) {
            const { m1, m2, m3 } = body.epKimMoc;
            if (Number.isFinite(Number(m1))) await this.configStore.upsertParam('EpKim_Moc1', Number(m1));
            if (Number.isFinite(Number(m2))) await this.configStore.upsertParam('EpKim_Moc2', Number(m2));
            if (Number.isFinite(Number(m3))) await this.configStore.upsertParam('EpKim_Moc3', Number(m3));
        }
        await this.afterWrite();
        return { success: true };
    }

    // ═══ Cấu hình form THEO LOẠI SẢN PHẨM (whitelist + mặc định + ẩn/khoá) — đều cấu hình được ═══

    private static readonly PRODUCT_TYPES = ['to_roi', 'bi_thu_folder', 'sp_khac', 'hop_giay', 'tui_giay'];

    @Get('cfg/product-config')
    async getProductConfig() {
        const d = await this.configStore.loadPricingData();
        return { success: true, data: d.productConfig ?? {} };
    }

    @Post('cfg/product-config')
    @UseGuards(AuthGuard('jwt'))
    async saveProductConfig(@Body() body: { config?: Record<string, any> }) {
        const valid = new Set(OffsetController.PRODUCT_TYPES);
        const strArr = (v: any): string[] | undefined =>
            Array.isArray(v) ? Array.from(new Set(v.filter((x) => typeof x === 'string' && x.length))) : undefined;
        const out: Record<string, any> = {};
        for (const [type, raw] of Object.entries(body?.config || {})) {
            if (!valid.has(type) || !raw || typeof raw !== 'object') continue;
            const c: any = raw;
            const clean: any = {};
            const am = strArr(c.allowedMaterials); if (am) clean.allowedMaterials = am;
            const av = strArr(c.allowedVatTuBeMat); if (av) clean.allowedVatTuBeMat = av;
            const ae = strArr(c.allowedEpKim); if (ae) clean.allowedEpKim = ae;
            const ak = strArr(c.allowedKhoIn); if (ak) clean.allowedKhoIn = ak;
            const akt = strArr(c.allowedKichThuoc); if (akt) clean.allowedKichThuoc = akt;
            const hidden = strArr(c.hidden); if (hidden) clean.hidden = hidden;
            const locked = strArr(c.locked); if (locked) clean.locked = locked;
            if (c.defaults && typeof c.defaults === 'object' && !Array.isArray(c.defaults)) {
                const defs: Record<string, string | number | boolean> = {};
                for (const [k, v] of Object.entries(c.defaults)) {
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') defs[k] = v;
                }
                if (Object.keys(defs).length) clean.defaults = defs;
            }
            // Chỉ lưu loại có ít nhất một thiết lập (gọn JSON).
            if (Object.keys(clean).length) out[type] = clean;
        }
        await this.configStore.saveProductConfig(out);
        await this.afterWrite();
        return { success: true };
    }

    @Get('cfg/hao-hut')
    async getHaoHutCurve() {
        const d = await this.configStore.loadPricingData();
        // Trả % (tyLe × 100) cho UI; sắp xếp theo mốc tăng dần.
        const rows = [...d.tyLe.haoHut]
            .sort((a, b) => a.mocSoLuong - b.mocSoLuong)
            .map((r) => ({ mocSoLuong: r.mocSoLuong, percent: Math.round(r.tyLe * 1000) / 10 }));
        return { success: true, data: rows };
    }

    @Post('cfg/hao-hut')
    @UseGuards(AuthGuard('jwt'))
    async saveHaoHutCurve(@Body() body: { rows: { mocSoLuong: number; percent: number }[] }) {
        await this.configStore.saveHaoHutCurve(body?.rows || []);
        await this.afterWrite();
        return { success: true };
    }

    // ═══ Machine Config CRUD ═══

    @Get('machines')
    @UseGuards(AuthGuard('jwt'))
    async getMachines() {
        const data = await this.masterData.getMachines();
        return { success: true, data };
    }

    @Post('machines')
    @UseGuards(AuthGuard('jwt'))
    async createMachine(@Body() body: any) {
        const data = await this.masterData.createMachine(body);
        return { success: true, data };
    }

    @Patch('machines/:id')
    @UseGuards(AuthGuard('jwt'))
    async updateMachine(@Param('id') id: string, @Body() body: any) {
        const data = await this.masterData.updateMachine(parseInt(id), body);
        return { success: true, data };
    }

    @Delete('machines/:id')
    @UseGuards(AuthGuard('jwt'))
    async deleteMachine(@Param('id') id: string) {
        await this.masterData.deleteMachine(parseInt(id));
        return { success: true };
    }

    // ═══ Plate Pricing CRUD ═══

    @Get('plates')
    @UseGuards(AuthGuard('jwt'))
    async getPlatePricings(@Query('machine_id') machineId?: string) {
        const data = await this.masterData.getPlatePricings(machineId ? parseInt(machineId) : undefined);
        return { success: true, data };
    }

    @Post('plates')
    @UseGuards(AuthGuard('jwt'))
    async createPlatePricing(@Body() body: any) {
        const data = await this.masterData.createPlatePricing(body);
        return { success: true, data };
    }

    @Patch('plates/:id')
    @UseGuards(AuthGuard('jwt'))
    async updatePlatePricing(@Param('id') id: string, @Body() body: any) {
        const data = await this.masterData.updatePlatePricing(parseInt(id), body);
        return { success: true, data };
    }

    @Delete('plates/:id')
    @UseGuards(AuthGuard('jwt'))
    async deletePlatePricing(@Param('id') id: string) {
        await this.masterData.deletePlatePricing(parseInt(id));
        return { success: true };
    }

    // ═══ Waste Rules CRUD ═══

    @Get('waste-rules')
    @UseGuards(AuthGuard('jwt'))
    async getWasteRules(@Query('print_method') printMethod?: string) {
        const data = await this.masterData.getWasteRules(printMethod);
        return { success: true, data };
    }

    @Post('waste-rules')
    @UseGuards(AuthGuard('jwt'))
    async createWasteRule(@Body() body: any) {
        const data = await this.masterData.createWasteRule(body);
        return { success: true, data };
    }

    @Patch('waste-rules/:id')
    @UseGuards(AuthGuard('jwt'))
    async updateWasteRule(@Param('id') id: string, @Body() body: any) {
        const data = await this.masterData.updateWasteRule(parseInt(id), body);
        return { success: true, data };
    }

    @Delete('waste-rules/:id')
    @UseGuards(AuthGuard('jwt'))
    async deleteWasteRule(@Param('id') id: string) {
        await this.masterData.deleteWasteRule(parseInt(id));
        return { success: true };
    }
}
