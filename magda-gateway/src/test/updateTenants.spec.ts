import setupTenantMode from "../setupTenantMode";
import TenantsLoader, { tenantsTable } from "../reloadTenants";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

import { expect } from "chai";
import * as nock from "nock";
import { delay } from "q";

describe("Test reload tenants", () => {
    const tenantsBaseUrl = "http://some.where";

    const requestScope = nock(tenantsBaseUrl, {
        reqheaders:{
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
        }
    })

    before(() => {
        // This will automatically create a default tenant loader not being
        // used in the test, which is OK.
        // A fresh tenant loader must be created for each test. Otherwise the
        // throttle mechanism will fail any tests that reuse the loader.
        setupTenantMode({ registryApi: tenantsBaseUrl });
    });

    beforeEach(() => {
        tenantsTable.clear();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it("should make request with correct tenant ID", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200,
            [
                {"domainName":"built.in","enabled":true,"id":0}
            ]
        );
        const tenantLoader = new TenantsLoader();    
        await tenantLoader.reloadTenants();
    
        expect(tenantsTable.get('built.in').id).to.equal(0)
        expect(tenantsTable.get('built.in').enabled).to.equal(true)
        expect(tenantsTable.size).to.equal(1)
    });

    it("should reload tenants table with enabled tenants only", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200, 
            [
                {"domainName":"built.in","enabled":true,"id":0},
                {"domainName":"web1.com","enabled":false,"id":1},
                {"domainName":"web2.com","enabled":true,"id":2}
            ]
        );
            
        const tenantLoader = new TenantsLoader();
        await tenantLoader.reloadTenants();
    
        expect(tenantsTable.size).to.equal(2);
        expect(tenantsTable.get("built.in").id).to.equal(0);
        expect(tenantsTable.get("web1.com")).to.equal(undefined);
        expect(tenantsTable.get("web2.com").id).to.equal(2);
    });

    it("should remove disabled tenants", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200,
            [
                {"domainName":"built.in","enabled":true,"id":0},
                {"domainName":"web1.com","enabled":true,"id":1},
                {"domainName":"web2.com","enabled":false,"id":2}
             ]
        );
        
        const tenant_0 = new Tenant();
        const tenant_1 = new Tenant();
        const tenant_2 = new Tenant();
        tenant_0.id = 0;
        tenant_1.id = 1;
        tenant_2.id = 2;
        tenant_0.enabled = true;
        tenant_1.enabled = true;
        tenant_2.enabled = true;

        tenantsTable.set("built.in", tenant_0);
        tenantsTable.set("web1.com", tenant_1);
        tenantsTable.set("web2.com", tenant_2);

        const tenantLoader = new TenantsLoader();
        await tenantLoader.reloadTenants();
    
        expect(tenantsTable.size).to.equal(2);
        expect(tenantsTable.get("built.in").id).to.equal(0);
        expect(tenantsTable.get("web1.com").id).to.equal(1);
        expect(tenantsTable.get("web2.com")).to.equal(undefined);
    });

    it("should fetch tenants only once if the interval of two requests is less than the min wait time", async () => {
        const testDomainName = "some.com";
        const minReqIntervalInMs = 200;
        const theReqIntervalInMs = 20;
        const expectedTenantId = 1;
        const otherTenantId = 2;

        const tenantLoader = new TenantsLoader(minReqIntervalInMs)
        
        const request_1 = requestScope
        .get("/tenants")
        .reply(
            200,
            [{"domainName":`${testDomainName}`, "enabled":true, "id":expectedTenantId }]
        );
        
        await tenantLoader.reloadTenants();
        expect(request_1.isDone()).to.equal(true);

        const request_2 = requestScope
        .get("/tenants")
        .reply(
            200,
            [{"domainName":`${testDomainName}`, "enabled":true, "id":otherTenantId }]
        );

        await delay(() => {}, theReqIntervalInMs)
        await tenantLoader.reloadTenants();
        
        expect(request_2.isDone()).to.equal(false);
        expect(tenantsTable.get(testDomainName).id).to.equal(expectedTenantId);
    });

    it("should fetch tenants twice if the interval of two requests is greater than the min wait time", async () => {
        const testDomainName = "some.com";
        const minReqIntervalInMs = 100;
        const theReqIntervalInMs = 200;
        const expectedTenantId = 2;
        const otherTenantId = 1;

        const tenantLoader = new TenantsLoader(minReqIntervalInMs)

        const request_1 = requestScope
        .get("/tenants")
        .reply(
            200,
            [{"domainName":`${testDomainName}`, "enabled":true, "id":otherTenantId }]
        );
        
        await tenantLoader.reloadTenants();
        expect(request_1.isDone()).to.equal(true);

        const request_2 = requestScope
        .get("/tenants")
        .reply(
            200,
            [{"domainName":`${testDomainName}`, "enabled":true, "id":expectedTenantId }]
        );

        await delay(() => {}, theReqIntervalInMs)
        await tenantLoader.reloadTenants();
        
        expect(request_2.isDone()).to.equal(true);
        expect(tenantsTable.get(testDomainName).id).to.equal(expectedTenantId);
    });
});
