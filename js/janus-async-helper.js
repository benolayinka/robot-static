import Janus from "./janus.js"

export default class JanusAsyncHelper {
    constructor(props) {

        this.opaqueId = "share-"+Janus.randomString(12)
        this.pluginHandles = {}
        this.janus = null;
    }

    init = (server) => {
        return new Promise((resolve, reject) => {
            Janus.init({debug: 'all', callback: () => {
                    this.janus = new Janus(
                        {
                            server: server,
                            success: () => {
                                //component is not rendered
                                this.connected = true
                                resolve()
                            },
                            error: () => {
                                reject()
                            }
                        }
                    )
                } 
            })
        })
    }

    attachPlugin = (plugin) => {
        return new Promise((resolve, reject) => {
            if(!this.connected)
                reject()

            this.janus.attach({
                plugin: plugin,
                opaqueId: this.opaqueId,
                success: (pluginHandle) => {
                    this.pluginHandles[plugin] = pluginHandle
                    resolve(pluginHandle)
                },
                error: () => {
                    reject()
                }
            })
        })
    }

    attachCallback = (plugin, event, callback) => {
        this.pluginHandles[plugin][event] = callback;
    }

    sendMessage = (plugin, object) => {
        return new Promise((resolve, reject)=> {
            if(!this.pluginHandles[plugin])
                reject()

            this.pluginHandles[plugin].send(
                {
                    message: object,
                    success: (result) =>{
                        resolve(result)
                    }
                }
            )
        })
    }

    render() {
        return (null);
    }
}