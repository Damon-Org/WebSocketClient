import EventModule from './structures/EventModule.js'
import { OPCodes, TargetTypes } from './util/Constants.js'
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

    setup() {
        this._client = new WSClient(this);

        this._client.on('event', (...args) => this.emit('event', ...args));
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
