import SpecTableClient from './client'
import { Filters } from '@spec.dev/core'
import { SpecTableQueryOptions } from './lib/types'

export const tableClient = new SpecTableClient()

export const queryTableWithFilters = async (
    table: string,
    filters: Filters,
    options?: SpecTableQueryOptions
): Promise<Response> => tableClient.queryTableWithFilters(
    table, 
    filters, 
    options,
)

export * from './lib/tables'
export * from './lib/types'