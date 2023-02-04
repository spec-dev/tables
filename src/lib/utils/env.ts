export const ev = (name: string, fallback: any = null) => {
    if (onDeno()) {
        // @ts-ignore
        return Deno.env.get(name) || fallback
    } else {
        return process.env[name] || fallback
    }
}

export const onDeno = (): boolean => 'Deno' in globalThis
