import SpecTableClient from './client'
import { Filters } from '@spec.dev/core'
import { SpecTableQueryOptions } from './lib/types'

export const tableClient = new SpecTableClient()

export const queryTable = async (
    table: string,
    filters?: Filters,
    options?: SpecTableQueryOptions
): Promise<Response> => tableClient.queryTable(table, filters, options)

export * from './lib/tables'
export * from './lib/types'
