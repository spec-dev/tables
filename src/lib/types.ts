export type StringKeyMap = { [key: string]: any }

export type StringMap = { [key: string]: string }

export type SpecTableClientOptions = {
    origin?: string
}

export type SpecTableQueryOptions = {
    transforms?: RecordTransform[]
    camelResponse?: boolean
}

export type RecordTransform = (input: any) => any

export type QueryPayload = {
    sql: string
    bindings: any[]
}
