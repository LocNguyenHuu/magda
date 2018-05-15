import {} from "mocha";
import { ApiRouterOptions } from "../createApiRouter";
import { SMTPMailer, Message } from "../SMTPMailer";

import createApiRouter from "../createApiRouter";

import { expect } from "chai";
import * as sinon from "sinon";
import * as supertest from "supertest";
import * as express from "express";
import * as nock from "nock";
import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";

const REGISTRY_URL: string = "https://registry.example.com";
const registry: RegistryClient = new RegistryClient({
    baseUrl: REGISTRY_URL,
    maxRetries: 0,
    secondsBetweenRetries: 0
});

const stubbedSMTPMailer: SMTPMailer = {
    checkConnectivity() {
        return null;
    },
    send(): Promise<{}> {
        return null;
    }
} as SMTPMailer;

const DEFAULT_SENDER_NAME = "Bob Cunningham";
const DEFAULT_SENDER_EMAIL = "bob.cunningham@example.com";
const DEFAULT_MESSAGE = "Gib me a dataset";
const DEFAULT_DATASET_ID = "ds-blah-1234";
const DEFAULT_DATASET_TITLE = "thisisatitle";
const DEFAULT_DATASET_PUBLISHER = "publisher";

describe("send dataset request mail", () => {
    const DEFAULT_RECIPIENT = "blah@example.com";
    let app: express.Express;
    let sendStub: sinon.SinonStub;
    let registryScope: nock.Scope;

    beforeEach(() => {
        sendStub = sinon.stub(stubbedSMTPMailer, "send");

        app = express();
        app.use(require("body-parser").json());
        app.use("/", createApiRouter(resolveRouterOptions(stubbedSMTPMailer)));

        registryScope = nock(REGISTRY_URL);
    });

    afterEach(() => {
        sendStub.restore();
        registryScope.done();
    });

    describe("/healthz", () => {
        let checkConnectivityStub: sinon.SinonStub;

        beforeEach(() => {
            checkConnectivityStub = sinon.stub(
                stubbedSMTPMailer,
                "checkConnectivity"
            );
        });

        afterEach(() => {
            checkConnectivityStub.restore();
        });

        it("should return 200 if connection works", () => {
            checkConnectivityStub.returns(Promise.resolve());

            return supertest(app)
                .get("/healthz")
                .expect(200);
        });

        withStubbedConsoleError(stubbedError => {
            it("should return 500 if connection fails", () => {
                checkConnectivityStub.returns(
                    Promise.reject(new Error("Fake error"))
                );

                return supertest(app)
                    .get("/healthz")
                    .expect(500)
                    .then(() => {
                        expect(stubbedError().called).to.be.true;
                    });
            });
        });
    });

    describe("/public/send/dataset/request", () => {
        it("should respond with an 200 response if sendMail() was successful", () => {
            sendStub.returns(Promise.resolve());

            return supertest(app)
                .post("/public/send/dataset/request")
                .set({
                    "Content-Type": "application/json"
                })
                .send({
                    senderName: DEFAULT_SENDER_NAME,
                    senderEmail: DEFAULT_SENDER_EMAIL,
                    message: DEFAULT_MESSAGE
                })
                .expect(200)
                .then(() => {
                    const args: Message = sendStub.firstCall.args[0];

                    expect(args.to).to.equal(DEFAULT_RECIPIENT);
                    expect(args.from).to.contain(DEFAULT_SENDER_NAME);
                    expect(args.from).to.contain(DEFAULT_RECIPIENT);
                    expect(args.replyTo).to.contain(DEFAULT_SENDER_EMAIL);
                    expect(args.html).to.contain(DEFAULT_MESSAGE);
                    expect(args.text).to.contain(DEFAULT_MESSAGE);
                    expect(args.subject).to.contain(DEFAULT_SENDER_NAME);
                });
        });

        checkEmailErrorCases("/public/send/dataset/request");
    });

    describe("/public/send/dataset/:datasetId/report", () => {
        it("should respond with an 200 response if everything was successful", () => {
            sendStub.returns(Promise.resolve());

            stubGetRecordCall();

            return supertest(app)
                .post(`/public/send/dataset/${DEFAULT_DATASET_ID}/report`)
                .set({
                    "Content-Type": "application/json"
                })
                .send({
                    senderName: DEFAULT_SENDER_NAME,
                    senderEmail: DEFAULT_SENDER_EMAIL,
                    message: DEFAULT_MESSAGE
                })
                .expect(200)
                .then(() => {
                    const args: Message = sendStub.firstCall.args[0];

                    expect(args.to).to.equal(DEFAULT_RECIPIENT);
                    expect(args.from).to.contain(DEFAULT_SENDER_NAME);
                    expect(args.from).to.contain(DEFAULT_RECIPIENT);
                    expect(args.replyTo).to.contain(DEFAULT_SENDER_EMAIL);

                    expect(args.text).to.contain(DEFAULT_MESSAGE);
                    expect(args.text).to.contain(DEFAULT_DATASET_PUBLISHER);
                    expect(args.text).to.contain("feedback");

                    expect(args.html).to.contain(DEFAULT_MESSAGE);
                    expect(args.html).to.contain(DEFAULT_DATASET_PUBLISHER);
                    expect(args.html).to.contain("feedback");

                    expect(args.subject).to.contain(DEFAULT_DATASET_TITLE);
                });
        });

        checkEmailErrorCases(
            `/public/send/dataset/${DEFAULT_DATASET_ID}/report`,
            true
        );

        checkRegistryErrorCases(
            `/public/send/dataset/${DEFAULT_DATASET_ID}/report`
        );
    });
    describe("/public/send/dataset/:datasetId/question", () => {
        it("should respond with an 200 response if everything was successful", () => {
            sendStub.returns(Promise.resolve());

            stubGetRecordCall();

            return supertest(app)
                .post(`/public/send/dataset/${DEFAULT_DATASET_ID}/question`)
                .set({
                    "Content-Type": "application/json"
                })
                .send({
                    senderName: DEFAULT_SENDER_NAME,
                    senderEmail: DEFAULT_SENDER_EMAIL,
                    message: DEFAULT_MESSAGE
                })
                .expect(200)
                .then(() => {
                    const args: Message = sendStub.firstCall.args[0];

                    expect(args.to).to.equal(DEFAULT_RECIPIENT);
                    expect(args.from).to.contain(DEFAULT_SENDER_NAME);
                    expect(args.from).to.contain(DEFAULT_RECIPIENT);
                    expect(args.replyTo).to.contain(DEFAULT_SENDER_EMAIL);

                    expect(args.text).to.contain(DEFAULT_MESSAGE);
                    expect(args.text).to.contain(DEFAULT_DATASET_PUBLISHER);
                    expect(args.text).to.contain("question");

                    expect(args.html).to.contain(DEFAULT_MESSAGE);
                    expect(args.html).to.contain(DEFAULT_DATASET_PUBLISHER);
                    expect(args.html).to.contain("question");

                    expect(args.subject).to.contain(DEFAULT_DATASET_TITLE);
                });
        });

        checkEmailErrorCases(
            `/public/send/dataset/${DEFAULT_DATASET_ID}/question`,
            true
        );

        checkRegistryErrorCases(
            `/public/send/dataset/${DEFAULT_DATASET_ID}/question`
        );
    });

    function stubGetRecordCall() {
        registryScope
            .get(
                `/records/${DEFAULT_DATASET_ID}?aspect=dcat-dataset-strings&dereference=false`
            )
            .reply(200, {
                aspects: {
                    "dcat-dataset-strings": {
                        title: DEFAULT_DATASET_TITLE,
                        publisher: DEFAULT_DATASET_PUBLISHER
                    }
                }
            });
    }

    function withStubbedConsoleError(
        tests: (errorStubGetter: () => sinon.SinonStub) => void
    ) {
        describe("with stubbed console.error", () => {
            let errorStub: sinon.SinonStub;

            beforeEach(() => {
                errorStub = sinon.stub(console, "error");
            });

            afterEach(() => {
                errorStub.restore();
            });

            tests(() => errorStub);
        });
    }

    function checkRegistryErrorCases(path: string) {
        describe("Registry errors", () => {
            withStubbedConsoleError(errorStub => {
                it("should return 404 if getting dataset from registry returns 404", () => {
                    registryScope
                        .get(
                            `/records/${DEFAULT_DATASET_ID}?aspect=dcat-dataset-strings&dereference=false`
                        )
                        .reply(404);

                    return supertest(app)
                        .post(path)
                        .set({
                            "Content-Type": "application/json"
                        })
                        .send({
                            senderName: DEFAULT_SENDER_NAME,
                            senderEmail: DEFAULT_SENDER_EMAIL,
                            message: DEFAULT_MESSAGE
                        })
                        .expect(404)
                        .then(() => {
                            expect(errorStub().called).to.be.true;
                            expect(errorStub().firstCall.args[0]).to.contain(
                                DEFAULT_DATASET_ID
                            );
                        });
                });

                it("should return 500 if getting dataset from registry returns 500", () => {
                    registryScope
                        .get(
                            `/records/${DEFAULT_DATASET_ID}?aspect=dcat-dataset-strings&dereference=false`
                        )
                        .reply(500);

                    return supertest(app)
                        .post(path)
                        .set({
                            "Content-Type": "application/json"
                        })
                        .send({
                            senderName: DEFAULT_SENDER_NAME,
                            senderEmail: DEFAULT_SENDER_EMAIL,
                            message: DEFAULT_MESSAGE
                        })
                        .expect(500)
                        .then(() => {
                            expect(errorStub().called).to.be.true;
                        });
                });
            });
        });
    }

    function checkEmailErrorCases(
        path: string,
        stubGetRecordApi: boolean = false
    ) {
        describe("Email errors", () => {
            withStubbedConsoleError(errorStub => {
                it("should respond with an 500 response if sendMail() was unsuccessful", () => {
                    if (stubGetRecordApi) {
                        stubGetRecordCall();
                    }

                    sendStub.returns(Promise.reject(new Error("Fake error")));

                    return supertest(app)
                        .post(path)
                        .set({
                            "Content-Type": "application/json"
                        })
                        .send({
                            senderName: DEFAULT_SENDER_NAME,
                            senderEmail: DEFAULT_SENDER_EMAIL,
                            message: DEFAULT_MESSAGE
                        })
                        .expect(500)
                        .then(() => {
                            expect(sendStub.called).to.be.true;
                            expect(errorStub().called).to.be.true;
                        });
                });

                it("should raise an error if the sender provides an invalid email", () => {
                    return supertest(app)
                        .post(path)
                        .set({
                            "Content-Type": "application/json"
                        })
                        .send({
                            senderName: DEFAULT_SENDER_NAME,
                            senderEmail: "<INVALID EMAIL>",
                            message: DEFAULT_MESSAGE
                        })
                        .expect(400)
                        .then(() => {
                            expect(sendStub.called).to.be.false;
                        });
                });
            });
        });
    }

    function resolveRouterOptions(smtpMailer: SMTPMailer): ApiRouterOptions {
        return {
            jwtSecret: "squirrel",
            defaultRecipient: DEFAULT_RECIPIENT,
            smtpMailer: smtpMailer,
            registry
        };
    }
});
