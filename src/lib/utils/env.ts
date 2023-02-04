export const ev = (name: string, fallback: any = null) => {
    // @ts-ignore
    const env = onDeno() ? Deno.env.toObject() : process.env
    return env.hasOwnProperty(name) ? env[name] : fallback
}

export const onDeno = (): boolean => 'Deno' in globalThis
