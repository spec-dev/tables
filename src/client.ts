import config from './lib/config'
import {
    RecordTransform,
    SpecTableClientOptions,
    StringKeyMap,
    SpecTableQueryOptions,
    QueryPayload,
    Filters,
} from './lib/types'
import { JSONParser } from './json/index'
import { buildQuery } from './lib/utils/queryBuilder'
import humps from './lib/utils/humps'

const DEFAULT_OPTIONS = {
    origin: config.SHARED_TABLES_ORIGIN,
}

const DEFAULT_QUERY_OPTIONS = {
    transforms: [],
    camelResponse: true,
}

const streamRespHeaders = {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked',
}

/**
 * Spec Table Client.
 *
 * A Javascript client for querying Spec's shared tables.
 */
export default class SpecTableClient {
    protected origin: string

    get queryUrl(): string {
        const url = new URL(this.origin)
        url.pathname = '/stream'
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
     * Build and perform a query for the given table and filters.
     */
    async queryTable(
        table: string,
        filters?: Filters,
        options?: SpecTableQueryOptions
    ): Promise<Response> {
        return this._performQuery(buildQuery(table, filters || []), options)
    }

    /**
     * Perform a query and stream the result.
     */
    async _performQuery(
        queryPayload: QueryPayload,
        options?: SpecTableQueryOptions
    ): Promise<Response> {
        const opts = { ...DEFAULT_QUERY_OPTIONS, ...(options || {}) }

        // Make initial request to Tables API.
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 60000)
        const resp = await this._makeQueryRequest(queryPayload, abortController)
        clearTimeout(initialRequestTimer)

        const reader = resp.body?.getReader()!
        if (!reader) throw 'Unable to get response reader'

        // Create a JSON parser that parses every individual
        // record on-the-fly and applies the given transforms.
        const jsonParser = new JSONParser({
            stringBufferSize: undefined,
            paths: ['$.*'],
            keepStack: false,
        })

        // Add key-camelization as a transform if specified.
        const transforms = opts?.transforms || []
        if (opts?.camelResponse) {
            transforms.push((obj) => humps.camelizeKeys(obj))
        }

        let streamController, keepAliveTimer
        let streamClosed = false
        let hasEnqueuedOpeningBracket = false
        let hasEnqueuedAnObject = false

        const resetKeepAliveTimer = () => {
            keepAliveTimer && clearInterval(keepAliveTimer)
            keepAliveTimer = setInterval(() => {
                try {
                    streamClosed || streamController?.enqueue(new TextEncoder().encode(' '))
                } catch (err) {}
            }, 1000)
        }

        // Handle user-provided transforms and modify each record accordingly.
        jsonParser.onValue = (record) => {
            if (!record || streamClosed) return
            record = record as StringKeyMap

            if (!hasEnqueuedOpeningBracket) {
                streamController?.enqueue(new TextEncoder().encode('['))
                hasEnqueuedOpeningBracket = true
            }

            // Enqueue error and close stream if error encountered.
            if (record.error) {
                console.error(`Tables API returned error: ${record.error}`)
                enqueueJSON(record)
                hasEnqueuedAnObject = true
                streamController?.enqueue(new TextEncoder().encode(']'))
                streamController?.close()
                streamClosed = true
                return
            }

            // Apply any record transforms.
            const transformedRecord = this._transformRecord(record, transforms)
            if (!transformedRecord) return

            // Convert record back to buffer and enqueue it.
            enqueueJSON(transformedRecord)
            hasEnqueuedAnObject = true
        }

        const enqueueJSON = (data) => {
            try {
                let str = JSON.stringify(data)
                if (hasEnqueuedAnObject) {
                    str = ',' + str
                }
                const buffer = new TextEncoder().encode(str)
                streamController?.enqueue(buffer)
                resetKeepAliveTimer()
            } catch (err) {
                console.error('Error enqueueing JSON data', data)
            }
        }

        const stream = new ReadableStream({
            start(controller) {
                streamController = controller
                resetKeepAliveTimer()

                async function pump() {
                    try {
                        const { done, value } = await reader.read()
                        if (done) {
                            keepAliveTimer && clearInterval(keepAliveTimer)
                            streamController.enqueue(
                                new TextEncoder().encode(hasEnqueuedOpeningBracket ? ']' : '[]')
                            )
                            streamController.close()
                            streamClosed = true
                            return
                        }
                        streamClosed || (value && jsonParser.write(value))
                        return pump()
                    } catch (err) {
                        keepAliveTimer && clearInterval(keepAliveTimer)
                        streamController.close()
                        streamClosed = true
                        throw `Stream iteration error ${err}`
                    }
                }
                return pump()
            },
        })

        return new Response(stream, { headers: streamRespHeaders })
    }

    /**
     * Run a record through a list of user-defined transforms.
     */
    _transformRecord(record: StringKeyMap, transforms: RecordTransform[] = []): any {
        let transformedRecord = record
        for (const transform of transforms) {
            transformedRecord = transform(transformedRecord)
            if (transformedRecord === null) break // support for filter transforms
        }
        return transformedRecord
    }

    /**
     * Initial query POST request.
     */
    async _makeQueryRequest(
        payload: StringKeyMap,
        abortController: AbortController
    ): Promise<Response> {
        let resp: Response
        try {
            resp = await fetch(this.queryUrl, {
                method: 'POST',
                headers: this.requestHeaders,
                body: JSON.stringify(payload),
                signal: abortController.signal,
            })
        } catch (err) {
            throw `Initial request error: ${err}`
        }
        if (!resp) throw 'Got empty response'
        return resp
    }
}
