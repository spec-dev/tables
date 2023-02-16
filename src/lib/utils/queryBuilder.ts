import {
    QueryPayload,
    StringKeyMap,
    Filters,
    FilterOp,
    SelectOptions,
    OrderByDirection,
} from '../types'
import { ident, literal } from './pgFormat'

const filterOpValues = new Set(Object.values(FilterOp))

const identPath = (value: string): string =>
    value
        .split('.')
        .map((v) => ident(v))
        .join('.')

/**
 * Create a select sql query with bindings for the given table & filters.
 */
export function buildSelectQuery(
    table: string,
    filters: Filters,
    options: SelectOptions
): QueryPayload {
    // Build initial select query.
    const select = `select * from ${identPath(table)}`

    // Type-check filters and handle case where empty.
    const filtersIsArray = Array.isArray(filters)
    const filtersIsObject = !filtersIsArray && typeof filters === 'object'
    if (
        !filters ||
        (filtersIsArray && !filters.length) ||
        (filtersIsObject && !Object.keys(filters).length)
    ) {
        return {
            sql: addSelectOptionsToQuery(select, options),
            bindings: [],
        }
    }

    filters = filtersIsArray ? filters : [filters]

    const orStatements: string[] = []
    const values: any = []
    const bindingIndex = { i: 1 }
    for (const inclusiveFilters of filters as StringKeyMap[]) {
        const andStatement = buildAndStatement(inclusiveFilters, values, bindingIndex)
        andStatement?.length && orStatements.push(andStatement)
    }
    if (!orStatements.length) {
        return {
            sql: addSelectOptionsToQuery(select, options),
            bindings: [],
        }
    }

    const whereClause =
        orStatements.length > 1 ? orStatements.map((s) => `(${s})`).join(' or ') : orStatements[0]

    let sql = `${select} where ${whereClause}`

    return {
        sql: addSelectOptionsToQuery(sql, options),
        bindings: values,
    }
}

/**
 * Create an upsert sql query with bindings for the given table & filters.
 */
export function buildUpsertQuery(
    table: string,
    data: StringKeyMap[],
    conflictColumns: string[],
    updateColumns: string[],
    returning?: string | string[]
): QueryPayload {
    const insertColNames = Object.keys(data[0]).sort()
    if (!insertColNames.length) throw 'No values to upsert'

    let sql = `insert into ${identPath(table)} (${insertColNames.map(ident).join(', ')})`

    const placeholders: string[] = []
    const bindings: any[] = []
    let i = 1
    for (const entry of data) {
        const entryPlaceholders: string[] = []
        for (const colName of insertColNames) {
            entryPlaceholders.push(`$${i}`)
            bindings.push(entry[colName])
            i++
        }
        placeholders.push(`(${entryPlaceholders.join(', ')})`)
    }

    sql += ` values ${placeholders.join(', ')} on conflict (${conflictColumns
        .map(ident)
        .join(', ')})`

    if (!updateColumns.length) {
        sql += ' do nothing'
        return { sql, bindings }
    }

    const updates: string[] = []
    for (const updateColName of updateColumns) {
        updates.push(`${ident(updateColName)} = excluded.${ident(updateColName)}`)
    }

    sql += ` do update set ${updates.join(', ')}`

    if (returning) {
        const isAll = returning === '*'
        returning = Array.isArray(returning) ? returning : [returning]
        sql += ` returning ${isAll ? '*' : returning.map(ident).join(', ')}`
    }

    return { sql, bindings }
}

/**
 * Build an inclusive AND group for a WHERE clause.
 * Ex: x = 3 and y > 4 and ...
 */
export function buildAndStatement(
    filtersMap: StringKeyMap,
    values: any[],
    bindingIndex: StringKeyMap
) {
    if (!filtersMap) return null
    let numKeys
    try {
        numKeys = Object.keys(filtersMap).length
    } catch (e) {
        return null
    }
    if (!numKeys) return null

    const statements: string[] = []

    for (const colPath in filtersMap) {
        let value = filtersMap[colPath]
        const isArray = Array.isArray(value)
        const isObject = !isArray && typeof value === 'object'
        const isFilterObject = isObject && value.op && value.hasOwnProperty('value')

        if (
            value === null ||
            value === undefined ||
            (isArray && !value.length) ||
            (isArray && !!value.find((v) => Array.isArray(v))) ||
            (isObject && (!Object.keys(value).length || !isFilterObject))
        ) {
            continue
        }

        let op = FilterOp.EqualTo
        if (isArray) {
            op = FilterOp.In
        } else if (isFilterObject) {
            op = value.op
            value = value.value
        }

        if (!filterOpValues.has(op)) continue

        let valuePlaceholder
        if (Array.isArray(value)) {
            const valuePlaceholders: string[] = []
            for (const v of value) {
                valuePlaceholders.push(`$${bindingIndex.i}`)
                values.push(v)
                bindingIndex.i++
            }
            valuePlaceholder = `(${valuePlaceholders.join(', ')})`
        } else {
            valuePlaceholder = `$${bindingIndex.i}`
            values.push(value)
            bindingIndex.i++
        }

        statements.push(`${identPath(colPath)} ${op} ${valuePlaceholder}`)
    }

    return statements.join(' and ')
}

function addSelectOptionsToQuery(sql: string, options?: SelectOptions): string {
    options = options || {}
    const orderBy = options.orderBy

    // Order by
    if (orderBy?.column && Object.values(OrderByDirection).includes(orderBy?.direction)) {
        sql += ` order by ${identPath(orderBy.column)} ${orderBy.direction}`
    }

    // Offset
    if (options.hasOwnProperty('offset')) {
        sql += ` offset ${literal(options.offset)}`
    }

    // Limit
    if (options.hasOwnProperty('limit')) {
        sql += ` limit ${literal(options.limit)}`
    }

    return sql
}
