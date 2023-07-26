import { ev } from './utils/env'

export default {
    SHARED_TABLES_ORIGIN: ev('SHARED_TABLES_ORIGIN', 'https://tables-ingress.spec.dev'),
    QUERY_RESPONSE_TIMEOUT: Number(ev('QUERY_REQUEST_TIMEOUT', 60000)),
    SHARED_TABLES_AUTH_HEADER_NAME: 'Spec-Auth-Token',
    MAX_TIMEOUT_RETRIES: Number(ev('MAX_TIMEOUT_RETRIES', 2)),
    MAX_ERROR_RETRIES: Number(ev('MAX_ERROR_RETRIES', 10)),
}
