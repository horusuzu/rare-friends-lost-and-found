/** Both pinned protocol tokens have 18 decimals. Never coerce money to Number. */
export function tokenAmount(value:bigint,precision=6):string {
 if(value===0n)return '0';
 const whole=value/10n**18n,decimals=(value%10n**18n).toString().padStart(18,'0').slice(0,precision).replace(/0+$/,'');
 if(whole===0n&&!decimals)return `<0.${'0'.repeat(precision-1)}1`;
 return whole.toLocaleString('en-US')+(decimals?`.${decimals}`:'');
}
