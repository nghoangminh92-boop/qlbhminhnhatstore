export const CATS=['Thuê mặt bằng','Lương nhân viên','Điện nước','Quảng cáo','Bảo hành / Sửa chữa','Vận chuyển','Khác'];
export const PAYS=['Tiền mặt','Chuyển khoản','Trả góp','Thẻ'];
export const fmt=n=>new Intl.NumberFormat('vi-VN').format(Math.round(n))+' ₫';
export const sh=n=>{const a=Math.abs(n);return a>=1e9?(n/1e9).toFixed(2)+' tỷ':a>=1e6?(n/1e6).toFixed(1)+' tr':fmt(n)};
export const ymOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
export const today=()=>{const d=new Date();return ymOf(d)+'-'+String(d.getDate()).padStart(2,'0')};
export const uid=()=>Math.random().toString(36).slice(2,9);
export const pname=p=>`${p.brand} ${p.model} ${p.storage}`;
export function stats(S,m){
  const sl=S.sales.filter(x=>x.date.slice(0,7)===m),ex=S.exps.filter(x=>x.date.slice(0,7)===m);
  const manual=(S.manualRevenues||[]).filter(x=>x.date.slice(0,7)===m);
  const repairs=(S.repairRevenues||[]).filter(x=>x.date.slice(0,7)===m);
  const saleById=new Map(S.sales.map(x=>[x.id,x]));
  const saleReturns=(S.saleReturns||[]).filter(x=>x.date.slice(0,7)===m);
  const returnRefund=saleReturns.reduce((a,x)=>a+x.refundAmt,0);
  const returnedUnits=saleReturns.reduce((a,x)=>a+x.qty,0);
  const returnedCogs=saleReturns.reduce((a,x)=>a+(saleById.get(x.saleId)?.cost||0)*x.qty,0);
  const salesRev=sl.reduce((a,x)=>a+x.price*x.qty,0),manualRev=manual.reduce((a,x)=>a+x.amt,0);
  const repairRev=repairs.reduce((a,x)=>a+x.amt,0),repairMaterialCost=repairs.reduce((a,x)=>a+(x.materialCost||0),0);
  const rev=salesRev-returnRefund+manualRev+repairRev,cogs=sl.reduce((a,x)=>a+x.cost*x.qty,0)-returnedCogs,exp=ex.reduce((a,x)=>a+x.amt,0);
  return{sl,ex,manual,repairs,saleReturns,returnRefund,returnedUnits,rev,salesRev,manualRev,repairRev,repairMaterialCost,cogs,exp,gross:rev-cogs-repairMaterialCost,net:rev-cogs-repairMaterialCost-exp,units:sl.reduce((a,x)=>a+x.qty,0)};
}
