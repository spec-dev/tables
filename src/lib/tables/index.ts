import { StringMap } from '../types'
import ethereumSchema from './ethereum'

const createTablePaths = (schema: string, tables: StringMap): StringMap => {
    const m = {}
    for (const key in tables) {
        m[key] = [schema, tables[key]].join('.')
    }
    return m
}

export const ethereum = createTablePaths(ethereumSchema.schema, ethereumSchema.tables)
