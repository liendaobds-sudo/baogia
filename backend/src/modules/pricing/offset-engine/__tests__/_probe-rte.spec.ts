import { loadDefaultPricingData } from '../default-data';
import { timKhoIn, docKichThuocCm, imposeFromKhoIn } from '../lookups';
import { resolveMarginConfig, imposeUnified } from '../imposition';
import { flatDielineSize, nestOnSheet } from '../../dieline';

describe('probe RTE 28x60', () => {
    it('prints So_Con from each path', () => {
        const d = loadDefaultPricingData();
        const kho = timKhoIn(d.khoIn[0].khoIn, d)!;
        const params = d.tyLe.params;
        // gate case: cao=10, rong=8, hong=4
        const cao = 10, rong = 8, hong = 4;
        const T = 0.5;
        const fd = flatDielineSize({ boxType: 'rte', L: rong * 10, W: hong * 10, D: cao * 10, T });
        const trai = { ngang: fd.widthCm, doc: fd.heightCm };
        const khoInDims = docKichThuocCm(kho.khoIn)!;
        const khoGiay = docKichThuocCm(kho.khoGiayLon);

        const nest = nestOnSheet(
            { boxType: 'rte', L: rong * 10, W: hong * 10, D: cao * 10, T },
            khoInDims.w * 10, khoInDims.h * 10,
        );
        // True physical packer on the LARGE sheet 84x120
        const nestLarge = nestOnSheet(
            { boxType: 'rte', L: rong * 10, W: hong * 10, D: cao * 10, T },
            khoGiay!.w * 10, khoGiay!.h * 10,
        );
        // Naive solid-rectangle grid on the LARGE sheet (no interlock), gap 0.3
        const { soConTrenKho } = require('../lookups');
        const rectLarge = soConTrenKho(khoGiay!.w, khoGiay!.h, trai.ngang, trai.doc, 0.3);

        const gap = (params.Gap_Cm as number) || 0.3;
        const legacyGrid = imposeFromKhoIn(kho, trai.ngang, trai.doc, gap);

        const margins = resolveMarginConfig(kho, params);
        const sheet = docKichThuocCm(kho.khoGiayLon)!;
        const press = docKichThuocCm(kho.khoIn)!;
        const unified = imposeUnified({
            itemWmm: trai.ngang * 10, itemHmm: trai.doc * 10,
            sheetWmm: sheet.w * 10, sheetHmm: sheet.h * 10,
            pressWmm: press.w * 10, pressHmm: press.h * 10,
            margins,
        });

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            khoIn: kho.khoIn, khoGiayLon: kho.khoGiayLon,
            khoInDims, khoGiay,
            dielineFlatCm: { w: fd.widthCm, h: fd.heightCm },
            nestOnSheet_press_countPerSheet: nest.countPerSheet,
            nest_press_label: nest.label,
            nestOnSheet_large_countPerSheet: nestLarge.countPerSheet,
            nest_large_label: nestLarge.label,
            rectGrid_large_solid: rectLarge,
            legacyGrid_imposeFromKhoIn: legacyGrid,
            margins,
            unified: { soConToLon: unified.soConToLon, soConBaiIn: unified.soConBaiIn, orientation: unified.orientation, usableArea: unified.usableArea },
        }, null, 2));
        expect(true).toBe(true);
    });
});
