import config from './lib/config'
import {
    SpecTableClientOptions,
    StringKeyMap,
    Filters,
    SelectOptions,
    AuthOptions,
    UpsertPayload,
} from './lib/types'

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
        options?: SelectOptions,
        authOptions?: AuthOptions
    ): Promise<StringKeyMap[]> {
        const payload = { table, filters: filters || [], options: options || {} }
        return this._performQuery(this.queryUrl, payload, authOptions)
    }

    /**
     * Build and perform an upsert query for the given table.
     */
    async upsert(payload: UpsertPayload, authOptions?: AuthOptions): Promise<StringKeyMap[]> {
        payload = this._formalizeUpsertPayload(payload)
        return this._performQuery(this.queryUrl, payload, authOptions)
    }

    /**
     * Build and perform a delete query for the given table.
     */
    async delete(table: string, filters?: Filters, authOptions?: AuthOptions) {
        const payload = { table, filters: filters || [], delete: true }
        return this._performQuery(this.queryUrl, payload, authOptions)
    }

    /**
     * Build and perform multiple upsert queries in the same DB transaction.
     */
    async tx(payloads: UpsertPayload[], authOptions?: AuthOptions): Promise<StringKeyMap[]> {
        payloads = payloads.map((p) => this._formalizeUpsertPayload(p))
        return this._performQuery(this.txUrl, payloads, authOptions)
    }

    _formalizeUpsertPayload(upsertData: UpsertPayload): UpsertPayload {
        const { table, data, conflictColumns, updateColumns, primaryTimestampColumn, returning } =
            upsertData

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

        // Ensure primary timestamp column given.
        if (!primaryTimestampColumn) {
            throw `No primary timestamp column given during upsert`
        }

        // Build and perform upsert.
        return {
            table,
            data: isArray ? data : [data],
            conflictColumns,
            updateColumns,
            primaryTimestampColumn,
            returning,
        }
    }

    /**
     * Perform a query and return the JSON-parsed result.
     */
    async _performQuery(
        url: string,
        payload: StringKeyMap | StringKeyMap[],
        authOptions?: AuthOptions,
        attempt: number = 1
    ): Promise<StringKeyMap[]> {
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), config.QUERY_RESPONSE_TIMEOUT)

        let resp
        try {
            resp = await this._makeRequest(url, payload, authOptions || null, abortController)
        } catch (err) {
            clearTimeout(timer)
            const message = err.message || err.toString() || ''
            const didTimeout = message.toLowerCase().includes('user aborted')
            if (
                (didTimeout && attempt > config.MAX_TIMEOUT_RETRIES) ||
                attempt > config.MAX_ERROR_RETRIES
            ) {
                throw err
            }
            return await this._performQuery(url, payload, authOptions, attempt + 1)
        }
        clearTimeout(timer)

        return this._parseResponse(resp)
    }

    /**
     * Initial query POST request.
     */
    async _makeRequest(
        url: string,
        payload: StringKeyMap | StringKeyMap[],
        authOptions: AuthOptions | null,
        abortController: AbortController
    ): Promise<Response> {
        let resp
        try {
            resp = await fetch(url, {
                method: 'POST',
                headers: this._buildHeaders(authOptions),
                body: JSON.stringify(payload),
                signal: abortController.signal,
            })
        } catch (err) {
            throw `Query request error: ${err}`
        }

        if (resp.status != 200) {
            let error = `Query failed with status ${resp.status}`
            let data = {}
            try {
                data = (await resp.json()) || {}
                error += `: ${JSON.stringify(data)}`
            } catch (e) {}
            throw error
        }

        return resp
    }

    _buildHeaders(authOptions: AuthOptions | null): StringKeyMap {
        const baseHeaders = this.requestHeaders
        return authOptions?.token
            ? {
                  ...baseHeaders,
                  [config.SHARED_TABLES_AUTH_HEADER_NAME]: authOptions.token,
              }
            : baseHeaders
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
