/**
 * Copyright 2018 F5 Networks, Inc.
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

const assert = require('assert');
const dns = require('dns');

const sinon = require('sinon');

const PATHS = require('../../nodejs/sharedConstants').PATHS;

let SystemHandler;

/* eslint-disable global-require */

describe('systemHandler', () => {
    let pathSent;
    let dataSent;
    let bigIpMock;
    let doUtilMock;
    let doUtilStub;
    let activeCalled;

    before(() => {
        doUtilMock = require('../../nodejs/doUtil');
        SystemHandler = require('../../nodejs/systemHandler');
    });

    beforeEach(() => {
        pathSent = null;
        dataSent = null;
        activeCalled = false;
        bigIpMock = {
            replace(path, data) {
                pathSent = path;
                dataSent = data;
                return Promise.resolve();
            },
            active() {
                activeCalled = true;
                return Promise.resolve();
            },
            create() {
                return Promise.resolve();
            },
            list() {
                return Promise.resolve();
            },
            modify() {
                return Promise.resolve();
            }
        };
        doUtilStub = sinon.stub(doUtilMock, 'getCurrentPlatform').callsFake(() => {
            return Promise.resolve('BIG-IP');
        });
        sinon.stub(dns, 'lookup').callsArg(1);
    });

    after(() => {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should handle DbVariables', () => {
        const declaration = {
            Common: {
                DbVariables: {
                    foo: 'bar',
                    hello: 123
                }
            }
        };

        let dbVarsSent;
        bigIpMock.onboard = {
            setDbVars(dbVars) {
                dbVarsSent = dbVars;
                return Promise.resolve();
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.deepEqual(dbVarsSent, declaration.Common.DbVariables);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    describe('DNS/NTP', () => {
        let bigIpStub;

        function setUpBigIpStubWithRequestOptions(requestOptions, bigIpVersion) {
            if (bigIpStub) {
                bigIpStub.restore();
            }

            bigIpStub = sinon.stub(bigIpMock, 'list').callsFake((path) => {
                if (path === '/tm/sys/management-dhcp/sys-mgmt-dhcp-config') {
                    return Promise.resolve({ requestOptions });
                }

                const bigIpDhclientStatus = 'dhclient (pid  12049) is running...';
                // eslint-disable-next-line max-len
                const bigIp14DhclientStatus = '* dhclient.service - SYSV: dhclient automatically configures the management interface when DHCP is available.\n   Loaded: loaded (/etc/rc.d/init.d/dhclient; bad; vendor preset: disabled)\n   Active: active (running) since Sat 2019-06-01 22:16:34 UTC; 8min ago\n     Docs: man:systemd-sysv-generator(8)\n  Process: 18049 ExecStop=/etc/rc.d/init.d/dhclient stop (code=exited, status=0/SUCCESS)\n  Process: 18099 ExecStart=/etc/rc.d/init.d/dhclient start (code=exited, status=0/SUCCESS)\n   CGroup: /system.slice/dhclient.service\n           `-18131 /sbin/dhclient -nw mgmt -cf /etc/dhclient.conf -lf /var/lib/dhclient/dhclient.leases -pf /var/run/dhclient.pid\n\nJun 01 22:16:34 localhost.localdomain dhclient[18099]: Current management-ip configuration mode for IPV4 is: DHCP.\nJun 01 22:16:34 localhost.localdomain dhclient[18114]: DHCPREQUEST on mgmt to 255.255.255.255 port 67 (xid=0x4646e482)\nJun 01 22:16:34 localhost.localdomain dhclient[18131]: DHCPACK from 10.145.64.1 (xid=0x4646e482)\nJun 01 22:16:34 localhost.localdomain dhclient[18099]: Starting /sbin/dhclient: [  OK  ]\nJun 01 22:16:34 localhost.localdomain systemd[1]: Started SYSV: dhclient automatically configures the management interface when DHCP is available..\nJun 01 22:16:36 localhost.localdomain tmsh[18057]: 01420002:5: AUDIT - pid=18057 user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=show sys mcp-state field-fmt\nJun 01 22:16:40 localhost.localdomain tmsh[18189]: 01420002:5: AUDIT - pid=18189 user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=show sys mcp-state field-fmt\nJun 01 22:16:40 localhost.localdomain tmsh[18192]: 01420002:5: AUDIT - pid=18192 user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=show sys mcp-state field-fmt\nJun 01 22:16:42 localhost.localdomain tmsh[18216]: 01420002:5: AUDIT - pid=18216 user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=show sys mcp-state field-fmt\nJun 01 22:16:42 localhost.localdomain dhclient[18131]: bound to 10.145.69.240 -- renewal in 1614 seconds.\n"';
                if (path === '/tm/sys/service/dhclient/stats') {
                    return Promise.resolve({
                        apiRawValues: {
                            apiAnonymous:
                                bigIpVersion === '14.1' ? bigIp14DhclientStatus : bigIpDhclientStatus
                        }
                    });
                }

                return Promise.resolve();
            });
        }

        beforeEach(() => {
            setUpBigIpStubWithRequestOptions([]);
        });

        it('should handle NTP', () => {
            const declaration = {
                Common: {
                    NTP: {
                        servers: [
                            '0.pool.ntp.org',
                            '1.pool.ntp.org'
                        ],
                        timezone: 'UTC'
                    }
                }
            };

            return new Promise((resolve, reject) => {
                const systemHandler = new SystemHandler(declaration, bigIpMock);
                systemHandler.process()
                    .then(() => {
                        assert.strictEqual(pathSent, PATHS.NTP);
                        assert.deepEqual(dataSent.servers, declaration.Common.NTP.servers);
                        assert.deepEqual(dataSent.timezone, declaration.Common.NTP.timezone);
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });

        it('should handle NTP with no servers declared', () => {
            const declaration = {
                Common: {
                    NTP: {
                        timezone: 'UTC'
                    }
                }
            };

            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process();
        });

        it('should turn off DHCP of NTP if we configure NTP', () => {
            const declaration = {
                Common: {
                    NTP: {
                        timezone: 'UTC'
                    }
                }
            };

            setUpBigIpStubWithRequestOptions(['one', 'two', 'ntp-servers', 'three']);

            sinon.stub(bigIpMock, 'modify').callsFake((path, body) => {
                assert.strictEqual(path, '/tm/sys/management-dhcp/sys-mgmt-dhcp-config');
                assert.strictEqual(body.requestOptions.length, 3);
                assert.strictEqual(body.requestOptions.indexOf('ntp-servers'), -1);
            });

            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process();
        });

        it('should reject NTP if bad hostname is sent', () => {
            dns.lookup.restore();
            sinon.stub(dns, 'lookup').callsArgWith(1, new Error('bad hostname'));

            const testServers = [
                'example.cant',
                'www.google.com',
                '10.56.48.3'
            ];
            const declaration = {
                Common: {
                    NTP: {
                        servers: testServers,
                        timezone: 'UTC'
                    }
                }
            };

            let didFail = false;
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process()
                .catch(() => {
                    didFail = true;
                })
                .then(() => {
                    if (!didFail) {
                        // eslint-disable-next-line max-len
                        const message = `All of these ${JSON.stringify(testServers)} exist, and one should NOT`;
                        assert.fail(message);
                    }
                });
        });

        it('should reject if DNS configured after NTP is configured', () => {
            let isDnsConfigured = false;
            sinon.stub(bigIpMock, 'replace').callsFake((path) => {
                if (path === PATHS.DNS) {
                    isDnsConfigured = true;
                }
                return Promise.resolve();
            });
            dns.lookup.restore();
            sinon.stub(dns, 'lookup').callsFake((address, callback) => {
                const message = 'DNS must be configured before NTP, so server hostnames can be checked';
                assert.strictEqual(isDnsConfigured, true, message);
                callback();
            });

            const testServers = [
                'www.google.com',
                '10.56.48.3'
            ];
            const declaration = {
                Common: {
                    DNS: {
                        nameServers: [
                            '8.8.8.8',
                            '2001:4860:4860::8844'
                        ],
                        search: ['one.com', 'two.com']
                    },
                    NTP: {
                        servers: testServers,
                        timezone: 'UTC'
                    }
                }
            };

            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process();
        });

        it('should handle DNS', () => {
            const declaration = {
                Common: {
                    DNS: {
                        nameServers: [
                            '8.8.8.8',
                            '2001:4860:4860::8844'
                        ],
                        search: ['one.com', 'two.com']
                    }
                }
            };

            return new Promise((resolve, reject) => {
                const systemHandler = new SystemHandler(declaration, bigIpMock);
                systemHandler.process()
                    .then(() => {
                        assert.strictEqual(pathSent, PATHS.DNS);
                        assert.deepEqual(dataSent.nameServers, declaration.Common.DNS.servers);
                        assert.deepEqual(dataSent.search, declaration.Common.DNS.search);
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });

        it('should turn off DHCP of DNS if we configure DNS', () => {
            const declaration = {
                Common: {
                    DNS: {
                        nameServers: ['1.2.3.4'],
                        search: ['f5.com']
                    }
                }
            };

            setUpBigIpStubWithRequestOptions(['one', 'two', 'domain-name-servers', 'domain-name', 'three']);

            sinon.stub(bigIpMock, 'modify').callsFake((path, body) => {
                assert.strictEqual(path, '/tm/sys/management-dhcp/sys-mgmt-dhcp-config');
                assert.strictEqual(body.requestOptions.length, 3);
                assert.strictEqual(body.requestOptions.indexOf('domain-name-servers'), -1);
                assert.strictEqual(body.requestOptions.indexOf('domain-name'), -1);
            });

            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process();
        });

        it('should turn off DHCP of DNS if we configure DNS on BIG-IP 14.1', () => {
            const declaration = {
                Common: {
                    DNS: {
                        nameServers: ['1.2.3.4'],
                        search: ['f5.com']
                    }
                }
            };

            setUpBigIpStubWithRequestOptions(
                ['one', 'two', 'domain-name-servers', 'domain-name', 'three'], '14.1'
            );

            sinon.stub(bigIpMock, 'modify').callsFake((path, body) => {
                assert.strictEqual(path, '/tm/sys/management-dhcp/sys-mgmt-dhcp-config');
                assert.strictEqual(body.requestOptions.length, 3);
                assert.strictEqual(body.requestOptions.indexOf('domain-name-servers'), -1);
                assert.strictEqual(body.requestOptions.indexOf('domain-name'), -1);
            });

            const systemHandler = new SystemHandler(declaration, bigIpMock);
            return systemHandler.process();
        });
    });

    it('should handle hostname', () => {
        const declaration = {
            Common: {
                hostname: 'myhost.example.com'
            }
        };

        let hostnameSent;
        bigIpMock.onboard = {
            hostname(hostname) {
                hostnameSent = hostname;
                return Promise.resolve();
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(hostnameSent, declaration.Common.hostname);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should handle root users', () => {
        const declaration = {
            Common: {
                User: {
                    root: {
                        userType: 'root',
                        oldPassword: 'foo',
                        newPassword: 'bar'
                    }
                }
            }
        };

        let userSent;
        let newPasswordSent;
        let oldPasswordSent;
        bigIpMock.onboard = {
            password(user, newPassword, oldPassword) {
                userSent = user;
                newPasswordSent = newPassword;
                oldPasswordSent = oldPassword;
                return Promise.resolve();
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(userSent, 'root');
                    assert.strictEqual(newPasswordSent, declaration.Common.User.root.newPassword);
                    assert.strictEqual(oldPasswordSent, declaration.Common.User.root.oldPassword);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should handle non-root users', () => {
        const declaration = {
            Common: {
                User: {
                    user1: {
                        userType: 'regular',
                        password: 'foofoo',
                        partitionAccess: {
                            Common: {
                                role: 'guest'
                            }
                        },
                        shell: 'bash'
                    },
                    user2: {
                        userType: 'regular',
                        password: 'barbar',
                        partitionAccess: {
                            'all-partitions': {
                                role: 'guest'
                            },
                            Common: {
                                role: 'admin'
                            }
                        },
                        shell: 'tmsh'
                    }
                }
            }
        };

        const bodiesSent = [];
        bigIpMock.isBigIq = () => { return false; };
        bigIpMock.createOrModify = (path, body) => {
            pathSent = path;
            bodiesSent.push(body);
            return Promise.resolve();
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(pathSent, '/tm/auth/user');
                    assert.strictEqual(bodiesSent.length, 2);
                    assert.deepEqual(
                        bodiesSent[0]['partition-access'],
                        [
                            { name: 'Common', role: 'guest' }
                        ]
                    );
                    assert.deepEqual(bodiesSent[0].shell, 'bash');
                    assert.deepEqual(
                        bodiesSent[1]['partition-access'],
                        [
                            { name: 'all-partitions', role: 'guest' },
                            { name: 'Common', role: 'admin' }
                        ]
                    );
                    assert.deepEqual(bodiesSent[1].shell, 'tmsh');
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should handle reg key licenses', () => {
        const declaration = {
            Common: {
                License: {
                    licenseType: 'regKey',
                    regKey: 'MMKGX-UPVPI-YIEMK-OAZIS-KQHSNAZ',
                    addOnKeys: ['ABCDEFG-HIJKLMN', 'OPQRSTU-VWXYZAB'],
                    overwrite: true
                }
            }
        };

        let licenseArgs;
        bigIpMock.onboard = {
            license(args) {
                licenseArgs = args;
                return Promise.resolve();
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(licenseArgs.registrationKey, declaration.Common.License.regKey);
                    assert.deepEqual(licenseArgs.addOnKeys, declaration.Common.License.addOnKeys);
                    assert.strictEqual(licenseArgs.overwrite, declaration.Common.License.overwrite);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should provide descriptive licensing error if licensing fails', () => {
        const declaration = {
            Common: {
                License: {
                    licenseType: 'regKey',
                    regKey: 'MMKGX-UPVPI-YIEMK-OAZIS-KQHSNAZ',
                    addOnKeys: ['ABCDEFG-HIJKLMN', 'OPQRSTU-VWXYZAB'],
                    overwrite: true
                }
            }
        };

        bigIpMock.onboard = {
            license() {
                return Promise.reject(new Error('failed to license device'));
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    reject(new Error('should have rejected'));
                })
                .catch((err) => {
                    assert.strictEqual(err.message.startsWith('Error licensing'), true);
                    resolve();
                });
        });
    });

    it('should handle license pool licenses with unreachable BIG-IP', () => {
        const declaration = {
            Common: {
                License: {
                    licenseType: 'licensePool',
                    bigIqHost: '10.145.112.44',
                    bigIqUsername: 'admin',
                    bigIqPassword: 'foofoo',
                    licensePool: 'clpv2',
                    unitOfMeasure: 'daily',
                    skuKeyword1: 'my skukeyword1',
                    skuKeyword2: 'my skukeyword2',
                    reachable: false,
                    hypervisor: 'vmware',
                    overwrite: true
                }
            }
        };

        let bigIqHostSent;
        let bigIqUsernameSent;
        let bigIqPasswordSent;
        let licensePoolSent;
        let hypervisorSent;
        let optionsSent;
        bigIpMock.onboard = {
            licenseViaBigIq(bigIqHost, bigIqUsername, bigIqPassword, licensePool, hypervisor, options) {
                bigIqHostSent = bigIqHost;
                bigIqUsernameSent = bigIqUsername;
                bigIqPasswordSent = bigIqPassword;
                licensePoolSent = licensePool;
                hypervisorSent = hypervisor;
                optionsSent = options;
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(bigIqHostSent, declaration.Common.License.bigIqHost);
                    assert.strictEqual(bigIqUsernameSent, declaration.Common.License.bigIqUsername);
                    assert.strictEqual(bigIqPasswordSent, declaration.Common.License.bigIqPassword);
                    assert.strictEqual(licensePoolSent, declaration.Common.License.licensePool);
                    assert.strictEqual(hypervisorSent, declaration.Common.License.hypervisor);
                    assert.strictEqual(optionsSent.skuKeyword1, declaration.Common.License.skuKeyword1);
                    assert.strictEqual(optionsSent.skuKeyword2, declaration.Common.License.skuKeyword2);
                    assert.strictEqual(optionsSent.unitOfMeasure, declaration.Common.License.unitOfMeasure);
                    assert.strictEqual(optionsSent.noUnreachable, declaration.Common.License.reachable);
                    assert.strictEqual(optionsSent.overwrite, declaration.Common.License.overwrite);
                    assert.strictEqual(optionsSent.autoApiType, true);
                    assert.strictEqual(activeCalled, true);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should handle license pool licenses with reachable BIG-IP', () => {
        const declaration = {
            Common: {
                License: {
                    licenseType: 'licensePool',
                    bigIqHost: '10.145.112.44',
                    bigIqUsername: 'admin',
                    bigIqPassword: 'foofoo',
                    licensePool: 'clpv2',
                    unitOfMeasure: 'daily',
                    skuKeyword1: 'my skukeyword1',
                    skuKeyword2: 'my skukeyword2',
                    reachable: true,
                    bigIpUsername: 'mybigipuser',
                    bigIpPassword: 'barbar'
                }
            }
        };
        const managementAddress = '1.2.3.4';
        const managementPort = 5678;

        let optionsSent;
        bigIpMock.onboard = {
            licenseViaBigIq(bigIqHost, bigIqUsername, bigIqPassword, licensePool, hypervisor, options) {
                optionsSent = options;
            }
        };
        bigIpMock.deviceInfo = () => {
            return Promise.resolve({ managementAddress });
        };
        bigIpMock.port = managementPort;

        let bigIpUsernameSent;
        let bigIpPasswordSent;
        let bigIpHostSent;
        let bigIpPortSent;
        doUtilMock.getBigIp = (logger, options) => {
            bigIpUsernameSent = options.user;
            bigIpPasswordSent = options.password;
            bigIpHostSent = options.host;
            bigIpPortSent = options.port;
            return Promise.resolve(bigIpMock);
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(optionsSent.noUnreachable, declaration.Common.License.reachable);
                    assert.strictEqual(bigIpUsernameSent, declaration.Common.License.bigIpUsername);
                    assert.strictEqual(bigIpPasswordSent, declaration.Common.License.bigIpPassword);
                    assert.strictEqual(bigIpHostSent, managementAddress);
                    assert.strictEqual(bigIpPortSent, managementPort);
                    assert.strictEqual(activeCalled, true);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should handle license pool when running on BIG-IQ', () => {
        const declaration = {
            Common: {
                License: {
                    licenseType: 'licensePool',
                    licensePool: 'clpv2'
                }
            }
        };

        let bigIqHostSent;
        let optionsSent;

        doUtilStub.restore();
        sinon.stub(doUtilMock, 'getCurrentPlatform').callsFake(() => {
            return Promise.resolve('BIG-IQ');
        });

        bigIpMock.onboard = {
            licenseViaBigIq(bigIqHost, bigIqUsername, bigIqPassword, licensePool, hypervisor, options) {
                bigIqHostSent = bigIqHost;
                optionsSent = options;
            }
        };

        return new Promise((resolve, reject) => {
            const systemHandler = new SystemHandler(declaration, bigIpMock);
            systemHandler.process()
                .then(() => {
                    assert.strictEqual(bigIqHostSent, 'localhost');
                    assert.strictEqual(optionsSent.bigIqMgmtPort, 8100);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should reject if the bigIqHost is given a bad hostname', () => {
        dns.lookup.restore();
        sinon.stub(dns, 'lookup').callsArgWith(1, new Error('bad hostname'));

        const testCase = 'example.cant';
        const declaration = {
            Common: {
                License: {
                    bigIqHost: testCase
                }
            }
        };
        const managementAddress = '1.2.3.4';

        bigIpMock.onboard = {
            licenseViaBigIq() {}
        };
        bigIpMock.deviceInfo = () => {
            return Promise.resolve({ managementAddress });
        };

        doUtilMock.getBigIp = () => {
            return Promise.resolve(bigIpMock);
        };

        let didFail = false;
        const systemHandler = new SystemHandler(declaration, bigIpMock);
        return systemHandler.process()
            .catch(() => {
                didFail = true;
            })
            .then(() => {
                if (!didFail) {
                    const message = `testCase: ${testCase} does exist, and it should NOT`;
                    assert.fail(message);
                }
            });
    });

    describe('revoke', () => {
        it('should handle revoke from license pool', () => {
            const declaration = {
                Common: {
                    License: {
                        licenseType: 'licensePool',
                        bigIqHost: '10.145.112.44',
                        bigIqUsername: 'admin',
                        bigIqPassword: 'foofoo',
                        reachable: false,
                        revokeFrom: 'clpv2'
                    }
                }
            };

            let bigIqHostSent;
            let bigIqUsernameSent;
            let bigIqPasswordSent;
            let licensePoolSent;
            let optionsSent;
            bigIpMock.onboard = {
                revokeLicenseViaBigIq(bigIqHost, bigIqUsername, bigIqPassword, licensePool, options) {
                    bigIqHostSent = bigIqHost;
                    bigIqUsernameSent = bigIqUsername;
                    bigIqPasswordSent = bigIqPassword;
                    licensePoolSent = licensePool;
                    optionsSent = options;
                }
            };

            return new Promise((resolve, reject) => {
                const systemHandler = new SystemHandler(declaration, bigIpMock);
                systemHandler.process()
                    .then(() => {
                        assert.strictEqual(bigIqHostSent, declaration.Common.License.bigIqHost);
                        assert.strictEqual(bigIqUsernameSent, declaration.Common.License.bigIqUsername);
                        assert.strictEqual(bigIqPasswordSent, declaration.Common.License.bigIqPassword);
                        assert.strictEqual(licensePoolSent, declaration.Common.License.revokeFrom);
                        assert.strictEqual(optionsSent.noUnreachable, declaration.Common.License.reachable);
                        assert.strictEqual(activeCalled, false);
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });

        it('should handle revoke from license pool from a different BIG-IQ', () => {
            const declaration = {
                Common: {
                    License: {
                        licenseType: 'licensePool',
                        bigIqHost: '10.145.112.44',
                        bigIqUsername: 'admin',
                        bigIqPassword: 'foofoo',
                        reachable: false,
                        revokeFrom: {
                            bigIqHost: '10.145.112.45',
                            bigIqUsername: 'otherAdmin',
                            bigIqPassword: 'barbar',
                            licensePool: 'clpv2',
                            reachable: false
                        }
                    }
                }
            };

            let bigIqHostSent;
            let bigIqUsernameSent;
            let bigIqPasswordSent;
            let licensePoolSent;
            let optionsSent;
            bigIpMock.onboard = {
                revokeLicenseViaBigIq(bigIqHost, bigIqUsername, bigIqPassword, licensePool, options) {
                    bigIqHostSent = bigIqHost;
                    bigIqUsernameSent = bigIqUsername;
                    bigIqPasswordSent = bigIqPassword;
                    licensePoolSent = licensePool;
                    optionsSent = options;
                }
            };

            return new Promise((resolve, reject) => {
                const systemHandler = new SystemHandler(declaration, bigIpMock);
                systemHandler.process()
                    .then(() => {
                        assert.strictEqual(bigIqHostSent, declaration.Common.License.revokeFrom.bigIqHost);
                        assert.strictEqual(
                            bigIqUsernameSent,
                            declaration.Common.License.revokeFrom.bigIqUsername
                        );
                        assert.strictEqual(
                            bigIqPasswordSent,
                            declaration.Common.License.revokeFrom.bigIqPassword
                        );
                        assert.strictEqual(
                            licensePoolSent,
                            declaration.Common.License.revokeFrom.licensePool
                        );
                        assert.strictEqual(
                            optionsSent.noUnreachable,
                            declaration.Common.License.revokeFrom.reachable
                        );
                        assert.strictEqual(activeCalled, false);
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });
    });
});
