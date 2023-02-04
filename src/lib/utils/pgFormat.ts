// @ts-ignore
export const ident = (value: any) => 'ident' in globalThis ? globalThis.ident(value): value
// @ts-ignore
export const literal = (value: any) => 'literal' in globalThis ? globalThis.literal(value): value