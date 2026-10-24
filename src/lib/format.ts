/** Chip amounts are always shown with a dollar sign: money(1180) -> "$1,180". */
export const money = (amount: number): string => `$${Math.round(amount).toLocaleString('en-US')}`;
