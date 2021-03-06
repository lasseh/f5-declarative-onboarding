/**
 * Copyright 2018-2020 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const assert = chai.assert;
const sinon = require('sinon');
const PATHS = require('../../../src/lib/sharedConstants').PATHS;


let DeleteHandler;

/* eslint-disable global-require */

describe(('deleteHandler'), function testDeleteHandler() {
    this.timeout(10 * 1000);
    let bigIpMock;
    const deletedPaths = [];
    const transactionDeletedPaths = [];
    const fetchedPaths = [];
    const deletedDeviceGroups = [];

    before(() => {
        DeleteHandler = require('../../../src/lib/deleteHandler');

        bigIpMock = {
            cluster: {
                deleteDeviceGroup(deviceGroup) {
                    deletedDeviceGroups.push(deviceGroup);
                }
            }
        };
    });

    let bigIpMockSpy;
    beforeEach(() => {
        bigIpMock.delete = (path) => {
            deletedPaths.push(path);
            return Promise.resolve();
        };
        bigIpMock.list = path => new Promise((resolve) => {
            fetchedPaths.push(path);
            resolve([
                { fullPath: '/Common/system-auth' }
            ]);
        });
        bigIpMock.transaction = (transactions) => {
            if (Array.isArray(transactions)) {
                transactions.forEach((transaction) => {
                    deletedPaths.push(transaction.path);
                    transactionDeletedPaths.push(transaction.path);
                });
            }
            return Promise.resolve();
        };

        bigIpMockSpy = sinon.spy(bigIpMock);
        deletedPaths.length = 0;
        transactionDeletedPaths.length = 0;
        deletedDeviceGroups.length = 0;
        fetchedPaths.length = 0;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should issue deletes for Routes, SelfIps, and VLANs in that order', () => {
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            setTimeout(() => {
                resolve();
            }, path.includes(PATHS.Route) ? 50 : 0);
        });

        const state = {
            currentConfig: {
                Common: {
                    Route: {
                        deleteThisRoute: {
                            name: 'deleteThisRoute',
                            mtu: 0,
                            network: '1.2.3.5'
                        }
                    }
                }
            }
        };


        const declaration = {
            Common: {
                VLAN: {
                    deleteThisVLAN1: {},
                    deleteThisVLAN2: {}
                },
                Route: {
                    deleteThisRoute: {}
                },
                SelfIp: {
                    deleteThisSelfIp1: {},
                    deleteThisSelfIp2: {},
                    deleteThisSelfIp3: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock, undefined, state);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths.length, 6);
                assert.strictEqual(deletedPaths[0], '/tm/net/route/~Common~deleteThisRoute');
                assert.strictEqual(deletedPaths[1], '/tm/net/self/~Common~deleteThisSelfIp1');
                assert.strictEqual(deletedPaths[2], '/tm/net/self/~Common~deleteThisSelfIp2');
                assert.strictEqual(deletedPaths[3], '/tm/net/self/~Common~deleteThisSelfIp3');
                assert.strictEqual(deletedPaths[4], '/tm/net/vlan/~Common~deleteThisVLAN1');
                assert.strictEqual(deletedPaths[5], '/tm/net/vlan/~Common~deleteThisVLAN2');
            });
    });

    it('should issue deletes for Authentication subclasses', () => {
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            resolve();
        });

        const declaration = {
            Common: {
                Authentication: {
                    radius: {},
                    tacacs: {},
                    ldap: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(fetchedPaths.length, 6);
                assert.strictEqual(fetchedPaths[0], '/tm/auth/radius');
                assert.strictEqual(fetchedPaths[1], '/tm/auth/tacacs');
                assert.strictEqual(fetchedPaths[2], '/tm/auth/ldap');
                assert.strictEqual(fetchedPaths[3], '/tm/auth/radius-server');
                assert.strictEqual(deletedPaths.length, 5);
                assert.strictEqual(deletedPaths[0], '/tm/auth/radius/system-auth');
                assert.strictEqual(deletedPaths[1], '/tm/auth/tacacs/system-auth');
                assert.strictEqual(deletedPaths[2], '/tm/auth/ldap/system-auth');
                assert.strictEqual(deletedPaths[3], '/tm/auth/radius-server/~Common~system_auth_name1');
                assert.strictEqual(deletedPaths[4], '/tm/auth/radius-server/~Common~system_auth_name2');
            });
    });

    it('should issue deletes for Authentication radius servers', () => {
        /*
            /tm/auth/radius/system-auth should be deleted at first, that why
            its 'delete' promise will be resolved with delay.
            Expected result: order of issued deletes should be preserved.
         */
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            setTimeout(() => {
                resolve();
            }, path.includes('/tm/auth/radius/system-auth') ? 50 : 0);
        });

        const declaration = {
            Common: {
                Authentication: {
                    radius: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(fetchedPaths.length, 2);
                assert.strictEqual(fetchedPaths[0], '/tm/auth/radius');
                assert.strictEqual(fetchedPaths[1], '/tm/auth/radius-server');
                assert.strictEqual(deletedPaths.length, 3);
                assert.strictEqual(deletedPaths[0], '/tm/auth/radius/system-auth');
                assert.strictEqual(deletedPaths[1], '/tm/auth/radius-server/~Common~system_auth_name1');
                assert.strictEqual(deletedPaths[2], '/tm/auth/radius-server/~Common~system_auth_name2');
            });
    });

    it('should have no unhandled promises rejection when issue deletes for Authentication radius servers', () => {
        const errorMsg = 'this is a processing error';
        bigIpMock.delete = path => new Promise((resolve, reject) => {
            if (path.indexOf('system_auth_name1') !== -1) {
                reject(new Error(errorMsg));
            } else {
                resolve();
            }
        });

        const declaration = {
            Common: {
                Authentication: {
                    radius: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return assert.isRejected(deleteHandler.process(), 'this is a processing error',
            'processing error should have been caught');
    });

    it('should not issue deletes for missing Authentication items', () => {
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            resolve();
        });

        bigIpMock.list = path => new Promise((resolve) => {
            fetchedPaths.push(path);
            resolve([]);
        });

        const declaration = {
            Common: {
                Authentication: {
                    radius: {},
                    tacacs: {},
                    ldap: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(fetchedPaths.length, 6);
                assert.strictEqual(fetchedPaths[0], '/tm/auth/radius');
                assert.strictEqual(fetchedPaths[1], '/tm/auth/tacacs');
                assert.strictEqual(fetchedPaths[2], '/tm/auth/ldap');
                assert.strictEqual(fetchedPaths[3], '/tm/auth/radius-server');
                assert.strictEqual(deletedPaths.length, 0);
            });
    });

    it('should issue deletes for Authentication LDAP certificates', () => {
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            resolve();
        });

        bigIpMock.list = path => new Promise((resolve) => {
            fetchedPaths.push(path);
            if (path === '/tm/sys/file/ssl-cert') {
                resolve([
                    { fullPath: '/Common/do_ldapCaCert.crt' },
                    { fullPath: '/Common/do_ldapClientCert.crt' }
                ]);
            } else if (path === '/tm/sys/file/ssl-key') {
                resolve([
                    { fullPath: '/Common/do_ldapClientCert.key' }
                ]);
            } else {
                resolve([
                    { fullPath: '/Common/system-auth' }
                ]);
            }
        });

        const declaration = {
            Common: {
                Authentication: {
                    ldap: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(fetchedPaths.length, 3);
                assert.strictEqual(fetchedPaths[0], '/tm/auth/ldap');
                assert.strictEqual(fetchedPaths[1], '/tm/sys/file/ssl-cert');
                assert.strictEqual(fetchedPaths[2], '/tm/sys/file/ssl-key');
                assert.strictEqual(deletedPaths.length, 4);
                assert.strictEqual(deletedPaths[0], '/tm/auth/ldap/system-auth');
                assert.strictEqual(deletedPaths[1], '/tm/sys/file/ssl-cert/~Common~do_ldapCaCert.crt');
                assert.strictEqual(deletedPaths[2], '/tm/sys/file/ssl-cert/~Common~do_ldapClientCert.crt');
                assert.strictEqual(deletedPaths[3], '/tm/sys/file/ssl-key/~Common~do_ldapClientCert.key');
            });
    });

    it('should handle non-array response from bigIp.list', () => {
        bigIpMock.delete = path => new Promise((resolve) => {
            deletedPaths.push(path);
            resolve();
        });

        bigIpMock.list = path => new Promise((resolve) => {
            fetchedPaths.push(path);
            resolve({});
        });

        const declaration = {
            Common: {
                Authentication: {
                    radius: {},
                    tacacs: {},
                    ldap: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(fetchedPaths.length, 6);
                assert.strictEqual(fetchedPaths[0], '/tm/auth/radius');
                assert.strictEqual(fetchedPaths[1], '/tm/auth/tacacs');
                assert.strictEqual(fetchedPaths[2], '/tm/auth/ldap');
                assert.strictEqual(fetchedPaths[3], '/tm/auth/radius-server');
                assert.strictEqual(deletedPaths.length, 0);
            });
    });


    it('should not issue deletes for non-deletable classes', () => {
        const declaration = {
            Common: {
                NTP: {
                    doNotDeleteMe: {}
                },
                DNS: {
                    doNotDeleteMe: {}
                },
                Analytics: {
                    doNotDeleteMe: {}
                },
                HTTPD: {
                    doNotDeleteMe: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths.length, 0);
            });
    });

    it('should issue deletes for normal device groups', () => {
        const declaration = {
            Common: {
                DeviceGroup: {
                    deleteThisGroup: {},
                    deleteThisGroupToo: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedDeviceGroups.length, 2);
                assert.strictEqual(deletedDeviceGroups[0], 'deleteThisGroup');
                assert.strictEqual(deletedDeviceGroups[1], 'deleteThisGroupToo');
            });
    });

    it('should not issue deletes for read-only device groups', () => {
        const declaration = {
            Common: {
                DeviceGroup: {
                    device_trust_group: {},
                    gtm: {},
                    'datasync-global-dg': {},
                    'dos-global-dg': {},
                    deleteThisGroup: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedDeviceGroups.length, 1);
                assert.strictEqual(deletedDeviceGroups[0], 'deleteThisGroup');
            });
    });

    it('should report processing errors', () => {
        const errorMessage = 'this is a processing error';
        bigIpMock.delete = () => Promise.reject(new Error(errorMessage));

        const declaration = {
            Common: {
                VLAN: {
                    deleteThisVLAN: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return assert.isRejected(deleteHandler.process(), 'this is a processing error',
            'processing error should have been caught');
    });

    it('should properly set the path for Remote Roles', () => {
        const declaration = {
            Common: {
                RemoteAuthRole: {
                    test: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths[0], '/tm/auth/remote-role/role-info/test');
            });
    });

    it('should delete route domains separately with a transaction', () => {
        const state = {
            currentConfig: {
                Common: {
                    Route: {
                        deleteThisRoute: {
                            name: 'deleteThisRoute',
                            mtu: 0,
                            network: '1.2.3.5'
                        }
                    }
                }
            }
        };

        const declaration = {
            Common: {
                VLAN: {
                    deleteThisVLAN: {}
                },
                Route: {
                    deleteThisRoute: {}
                },
                SelfIp: {
                    deleteThisSelfIp: {}
                },
                RouteDomain: {
                    deleteThisRouteDomain1: {},
                    deleteThisRouteDomain2: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock, undefined, state);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(bigIpMockSpy.delete.callCount, 3);
                assert.strictEqual(bigIpMockSpy.transaction.callCount, 1);
                assert.strictEqual(deletedPaths.length, 5);
                assert.strictEqual(deletedPaths[0], '/tm/net/route/~Common~deleteThisRoute');
                assert.strictEqual(deletedPaths[1], '/tm/net/self/~Common~deleteThisSelfIp');
                assert.strictEqual(deletedPaths[2], '/tm/net/vlan/~Common~deleteThisVLAN');
                assert.strictEqual(deletedPaths[3], '/tm/net/route-domain/~Common~deleteThisRouteDomain1');
                assert.strictEqual(deletedPaths[4], '/tm/net/route-domain/~Common~deleteThisRouteDomain2');
                assert.strictEqual(transactionDeletedPaths.length, 2);
                assert.strictEqual(transactionDeletedPaths[0], '/tm/net/route-domain/~Common~deleteThisRouteDomain1');
                assert.strictEqual(transactionDeletedPaths[1], '/tm/net/route-domain/~Common~deleteThisRouteDomain2');
            });
    });

    it('should skip route domain 0 on attempt to delete it', () => {
        const declaration = {
            Common: {
                RouteDomain: {
                    0: {},
                    rd99: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths.indexOf('/tm/net/route-domain/~Common~0'), -1);
                assert.notStrictEqual(deletedPaths.indexOf('/tm/net/route-domain/~Common~rd99'), -1);
            });
    });

    it('should skip tunnel socks-tunnel and http-tunnel on attempt to delete it', () => {
        const declaration = {
            Common: {
                Tunnel: {
                    'socks-tunnel': {},
                    'http-tunnel': {},
                    tunnel: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths.indexOf('/tm/net/tunnels/tunnel/~Common~socks-tunnel'), -1);
                assert.strictEqual(deletedPaths.indexOf('/tm/net/tunnels/tunnel/~Common~http-tunnel'), -1);
                assert.notStrictEqual(deletedPaths.indexOf('/tm/net/tunnels/tunnel/~Common~tunnel'), -1);
            });
    });

    it('should skip dns resolver f5-aws-dns on attempt to delete it', () => {
        const declaration = {
            Common: {
                DNS_Resolver: {
                    'f5-aws-dns': {},
                    resolver: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock);
        return deleteHandler.process()
            .then(() => {
                assert.strictEqual(deletedPaths.indexOf('/tm/net/dns-resolver/~Common~f5-aws-dns'), -1);
                assert.notStrictEqual(deletedPaths.indexOf('/tm/net/dns-resolver/~Common~resolver'), -1);
            });
    });

    it('should delete a Route on LOCAL_ONLY', () => {
        const state = {
            currentConfig: {
                Common: {
                    Route: {
                        route: {
                            name: 'route',
                            mtu: 0,
                            netowrk: '1.2.3.5'
                        },
                        localRoute: {
                            name: 'localRoute',
                            mtu: 0,
                            netowrk: '1.2.3.4',
                            localOnly: true
                        }
                    }
                }
            }
        };

        const declaration = {
            Common: {
                Route: {
                    route: {},
                    localRoute: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock, undefined, state);
        return deleteHandler.process()
            .then(() => {
                assert.deepStrictEqual(deletedPaths, [
                    '/tm/net/route/~Common~route',
                    '/tm/net/route/~LOCAL_ONLY~localRoute'
                ]);
            });
    });

    it('should delete a RoutingAsPath', () => {
        const state = {
            currentConfig: {
                Common: {
                    RoutingAsPath: {
                        routingAsPathTest: {
                            name: 'routingAsPathTest',
                            entries: [
                                {
                                    name: 36,
                                    regex: 'bar'
                                }
                            ]
                        }
                    }
                }
            }
        };

        const declaration = {
            Common: {
                RoutingAsPath: {
                    routingAsPathTest: {}
                }
            }
        };

        const deleteHandler = new DeleteHandler(declaration, bigIpMock, undefined, state);
        return deleteHandler.process()
            .then(() => {
                assert.deepStrictEqual(deletedPaths, ['/tm/net/routing/as-path/~Common~routingAsPathTest']);
            });
    });
});
