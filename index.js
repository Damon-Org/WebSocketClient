import EventModule from './structures/EventModule.js'
import { DisconnectCodes, OPCodes, TargetTypes } from './util/Constants.js'
import { v4 as uuidv4 } from 'uuid'
import WSClient from './structures/WSClient.js'

export default class WSCommunicator extends EventModule {
    /**
     * @param {Main} main
     */
    constructor(main) {
        super(main);

        this.register(WSCommunicator, {
            name: 'wsClient',
            scope: 'global'
        });
    }

    /**
     * @returns {boolean}
     */
    get connected() {
        return this._client.connected;
    }

    /**
     * @private
     * @param {uuidv4} id
     */
    _onAuthenticated(id) {
        this.emit('ready');

        this.log.info('WS_CLIENT', `Authenticated and received ID: ${this.id}`);
    }

    /**
     * @private
     * @param {number} closeCode
     */
    _onClose(closeCode) {
        this.log.info('WS_CLIENT', `Connection was closed with code: ${closeCode}`);

        if (closeCode === DisconnectCodes['IDENTIFY_FAILED']) this.log.critical('WS_CLIENT', 'Client identification failed, check the payload for any errors or if the token is invalid.');
    }

    /**
     * @private
     * @param {Error} error
     */
    _onError(error) {
        this.log.error('WS_CLIENT', 'An error occured: ', error);
    }

    /**
     * @private
     * @param {Object} message
     */
    _onMessage(message) {
        this.log.info('WS_CLIENT', 'Received unknown message: ', message);
    }

    /**
     * @private
     */
    _onOpen() {
        this.log.info('WS_CLIENT', 'Connected to WS Server.');
    }

    setup() {
        this._client = new WSClient(this);

        this._client.on('event', (...args) => this.emit('event', ...args));

        this._client.on('authenticated', () => this._onAuthenticated());
        this._client.on('close', (closeCode) => this._onClose(closeCode));
        this._client.on('error', (error) => this._onError(error));
        this._client.on('message', (message) => this._onMessage(message));
        this._client.on('open', () => this._onOpen());
    }

    /**
     * @param {string} eventName
     * @param {string} targetType
     * @param {string} [targetIdentifier=null]
     * @param {JSON} [data=null]
     * @param {boolean} [collectResponse=false]
     * @param {number} [timeout=1e3]
     * @returns {boolean|Promise<Array>} Returns a true/false or Promise with an array of responses if collectResponse is set to true
     */
    sendEvent(eventName, targetType, targetIdentifier = null, data = null, collectResponse = false, timeout = 1e3) {
        if (targetIdentifier === 'self') {
            targetIdentifier = this._client.group;
        }

        if (!TargetTypes[targetType]) {
            throw new Error('Unknown target type was given.');

            return false;
        }

        if (TargetTypes['GLOBAL'] !== TargetTypes[targetType] && !targetIdentifier) {
            throw new Error('Only target type GLOBAL and REPLY can take no target identifier.');

            return false;
        }

        const pl = {
            op: OPCodes['EVENT'],
            d: data,
            e: eventName,
            i: {
                k: TargetTypes[targetType],
                id: targetIdentifier
            }
        };

        if (!collectResponse) return this._client.send(pl);

        let response = [];
        return new Promise((resolve, reject) => {
            // Create unique identifier to track events for this message internally as well as for the websocket server
            const uuid = uuidv4();
            pl.u = uuid;
            const eventListener = this._client.open(uuid);

            const _timeout = setTimeout(() => {
                response.timeout = true;
                resolve(response);

                eventListener.close();
            }, timeout);

            eventListener.on('response', (res) => {
                response.push(res.d);
            });

            eventListener.on('close', () => {
                resolve(response);

                clearTimeout(_timeout);
                eventListener.close();
            });

            // Send payload
            this._client.send(pl);
        });
    }

    /**
     * @param {string} id
     * @param {JSON} data
     */
    sendReply(id, data) {
        return this._client.send({
            u: id,
            op: OPCodes['REPLY'],
            d: data
        });
    }
}
