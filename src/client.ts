import config from './lib/config'
import {
    SpecTableClientOptions,
    StringKeyMap,
    QueryPayload,
    Filters,
    SelectOptions,
} from './lib/types'
import { buildSelectQuery, buildUpsertQuery } from './lib/utils/queryBuilder'
import fetch, { Response } from 'cross-fetch'

const DEFAULT_OPTIONS = {
    origin: config.SHARED_TABLES_ORIGIN,
}

/**
 * Spec Table Client.
 *
 * A Javascript client for querying Spec's shared tables.
 */
class SpecTableClient {
    protected origin: string

    get queryUrl(): string {
        const url = new URL(this.origin)
        url.pathname = '/query'
        return url.toString()
    }

    get txUrl(): string {
        const url = new URL(this.origin)
        url.pathname = '/tx'
        return url.toString()
    }

    get requestHeaders(): StringKeyMap {
        return {
            'Content-Type': 'application/json',
        }
    }

    /**
     * Create a new client instance.
     */
    constructor(options?: SpecTableClientOptions) {
        const settings = { ...DEFAULT_OPTIONS, ...options }
        this.origin = settings.origin
    }

    /**
     * Build and perform a select query for the given table and filters.
     */
    async select(
        table: string,
        filters?: Filters,
        options?: SelectOptions
    ): Promise<StringKeyMap[]> {
        const query = buildSelectQuery(table, filters || [], options || {})
        return this._performQuery(this.queryUrl, query)
    }

    /**
     * Build and perform an upsert query for the given table.
     */
    async upsert(
        table: string,
        data: StringKeyMap | StringKeyMap[],
        conflictColumns: string[],
        updateColumns: string[],
        returning?: string | string[]
    ): Promise<StringKeyMap[]> {
        // Ensure we're given something to upsert.
        const isArray = Array.isArray(data)
        const isObject = !isArray && typeof data === 'object'
        if (!data || (isArray && !data.length) || (isObject && !Object.keys(data).length)) {
            throw `No values provided to upsert`
        }

        // Ensure conflict columns exist.
        if (!conflictColumns?.length) {
            throw `No conflict columns given during upsert`
        }

        // Build and perform upsert.
        const query = buildUpsertQuery(
            table,
            isArray ? data : [data],
            conflictColumns,
            updateColumns,
            returning
        )
        return this._performQuery(this.queryUrl, query)
    }

    async tx(queryPayloads: QueryPayload[]): Promise<StringKeyMap[]> {
        return this._performQuery(this.txUrl, queryPayloads)
    }

    /**
     * Perform a query and return the JSON-parsed result.
     */
    async _performQuery(
        url: string,
        payload: QueryPayload | QueryPayload[]
    ): Promise<StringKeyMap[]> {
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), config.QUERY_RESPONSE_TIMEOUT)
        const resp = await this._makeRequest(url, payload, abortController)
        clearTimeout(timer)
        return this._parseResponse(resp)
    }

    /**
     * Initial query POST request.
     */
    async _makeRequest(
        url: string,
        payload: StringKeyMap | StringKeyMap[],
        abortController: AbortController
    ): Promise<Response> {
        try {
            return await fetch(url, {
                method: 'POST',
                headers: this.requestHeaders,
                body: JSON.stringify(payload),
                signal: abortController.signal,
            })
        } catch (err) {
            throw `Query request error: ${err}`
        }
    }

    /**
     * Parse JSON HTTP response.
     */
    async _parseResponse(resp: Response): Promise<StringKeyMap[]> {
        try {
            return (await resp.json()) || []
        } catch (err) {
            throw `Failed to parse JSON response data: ${err}`
        }
    }
}

export default SpecTableClient
