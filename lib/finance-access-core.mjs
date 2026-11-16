export function evaluateFinancialAccess({ block = null, hasActiveSubscription = true }) {
  if (!hasActiveSubscription) return block ? { id:block.id, level:block.level, blocked:['TOTAL','CANCELLED'].includes(block.level), restricted:['RESTRICTION','PARTIAL'].includes(block.level), reason:block.reason||'Cobrança pendente.' } : {level:'TOTAL',blocked:true,restricted:false,reason:'Nenhuma assinatura ativa.'};
  if (!block) return {level:'ACTIVE',blocked:false,restricted:false};
  return {id:block.id,level:block.level,blocked:['TOTAL','CANCELLED'].includes(block.level),restricted:['RESTRICTION','PARTIAL'].includes(block.level),reason:block.reason||'Cobrança pendente.',endsAt:block.ends_at||null,invoiceId:block.invoice_id||null};
}
