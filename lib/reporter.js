import events from 'events'
import merge from 'deepmerge'
import request from 'request'
import dateFormat from 'dateformat'

const MAX_LINES = 100
const DATE_FORMAT = 'yyyy-mm-dd HH:mm:ss,l o'

/**
 * Initialize a new sumologic test reporter.
 */
class SumoLogicReporter extends events.EventEmitter {
    constructor (baseReporter, config, options = {}) {
        super()

        this.baseReporter = baseReporter
        this.config = config
        this.options = merge({
            // specify request module to use (for testing purposes only)
            request: request,
            // define sync interval how often logs get pushed to Sumologic
            syncInterval: 100,
            // endpoint of collector source
            sourceAddress: process.env.SUMO_SOURCE_ADDRESS
        }, options)

        if (typeof this.options.sourceAddress !== 'string') {
            throw new Error('Sumo Logic requires "sourceAddress" paramater')
        }

        // Cache of entries we are yet to sync
        this.unsynced = []
        this.inSync = false

        this.errorCount = 0
        this.specs = {}
        this.results = {}
        this.interval = setInterval(::this.sync, this.options.syncInterval)

        this.on('start', (data) => {
            this.startTime = new Date()
            this.unsynced.push(this.safeToString({
                time: dateFormat(this.startTime, DATE_FORMAT),
                event: 'start',
                data
            }))
        })

        this.on('runner:start', (runner) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'runner:start',
                data: runner
            }))
        })

        this.on('suite:start', (suite) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'suite:start',
                data: suite
            }))
        })

        this.on('test:start', (test) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'test:start',
                data: test
            }))
        })

        this.on('test:pending', (test) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'test:pending',
                data: test
            }))
        })

        this.on('test:pass', (test) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'test:pass',
                data: test
            }))
        })

        this.on('test:fail', (test) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'test:fail',
                data: test
            }))
        })

        this.on('test:end', (test) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'test:end',
                data: test
            }))
        })

        this.on('suite:end', (suite) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'suite:end',
                data: suite
            }))
        })

        this.on('runner:end', (runner) => {
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'runner:end',
                data: runner
            }))
        })

        this.on('end', (payload) => {
            const duration = (new Date()).getTime() - this.startTime.getTime()
            this.unsynced.push(this.safeToString({
                time: dateFormat(new Date(), DATE_FORMAT),
                event: 'end',
                data: merge(payload, { duration })
            }))
            clearInterval(this.interval)

            /**
             * sync for the last time
             */
            this.sync()
        })
    }

    safeToString (obj) {
        try {
            return JSON.stringify(obj)
        } catch (err) {
            try {
                return JSON.stringify(String(obj))
            } catch (err) {
                return JSON.stringify('error serializing event')
            }
        }
    }

    sync () {
        if (this.inSync || this.unsynced.length === 0) {
            return
        }

        const logLines = this.unsynced.slice(0, MAX_LINES).join('\n')
        this.inSync = true

        request({
            method: 'POST',
            uri: this.options.sourceAddress,
            body: logLines
        }, (err, resp) => {
            const failed = Boolean(err) || resp.status < 200 || resp.status >= 400

            if (failed) {
                console.error('failed send data to Sumo Logic:\n', err.stack ? err.stack : err)
            } else {
                this.unsynced.splice(0, MAX_LINES)
            }

            this.inSync = false
        })
    }
}

export default SumoLogicReporter
