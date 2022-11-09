import SpecTableClient from './client'
import { SpecTableQueryOptions, Filters } from './lib/types'

export const tableClient = new SpecTableClient()

export const queryTable = async (
    table: string,
    filters?: Filters,
    options?: SpecTableQueryOptions
): Promise<Response> => tableClient.queryTable(table, filters, options)

export * from './lib/tables'
export * from './lib/types'
