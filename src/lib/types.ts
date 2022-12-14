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

export enum FilterOp {
    EqualTo = '=',
    NotEqualTo = '!=',
    GreaterThan = '>',
    GreaterThanOrEqualTo = '>=',
    LessThan = '<',
    LessThanOrEqualTo = '<=',
    In = 'in',
    NotIn = 'not in',
}

export interface Filter {
    op: FilterOp
    value: any
}

export type Filters = StringKeyMap | StringKeyMap[]
