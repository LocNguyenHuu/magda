import React from "react";
import Editor from "./Editor";

export type Contact = {
    name?: string;
    role?: string;
    organisation?: string;
};

export const contacts: Contact[] = [
    {
        name: "Daryl Quinlivan",
        role: "​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Cindy Briscoe",
        role: "Deputy Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Cass Kennedy",
        role: "First Assistant Secretary",
        organisation: "Department of Agriculture"
    },
    {
        name: "Laura Timmins",
        role: "Assistant Secretary",
        organisation: "Fisheries branch"
    },
    {
        name: "Michelle Lauder",
        role: "Assistant Secretary",
        organisation: "Forestry branch"
    },
    {
        name: "Julie Gaglia",
        role: "Assistant Secretary",
        organisation: "Ag Vet Chemicals"
    }
];

class ContactsSearch extends React.Component<any, any> {
    state = {
        results: [],
        searched: false
    };
    updateState(update: any) {
        console.log("UPDATE", update);
        this.setState((state, props) => Object.assign({}, state, update));
    }

    async search(e) {
        let searched = false;
        let results: Contact[] = [];

        try {
            const query = new RegExp(e.target.value, "i");
            const { existing } = this.props;

            if (e.target.value) {
                searched = true;
                results = contacts
                    .filter((contact: Contact) => {
                        return (
                            existing.filter(
                                existingItem =>
                                    existingItem.name === contact.name
                            ).length === 0 &&
                            ((contact.name || "").match(query) ||
                                (contact.role || "").match(query) ||
                                (contact.organisation || "").match(query))
                        );
                    })
                    .slice(0, 5);
            }
        } catch (e) {}
        this.updateState({ results, searched });
    }

    render() {
        const { results, searched } = this.state;

        return (
            <div>
                <div>
                    <input
                        className="au-text-input"
                        type="search"
                        placeholder="Add another contact point"
                        onChange={this.search.bind(this)}
                    />
                </div>
                {searched && (
                    <div>
                        {results.map((val: Contact) => {
                            return (
                                <div
                                    style={{
                                        padding: ".5em"
                                    }}
                                >
                                    {val.name} ({val.role}, {val.organisation}){" "}
                                    <button
                                        onClick={() => {
                                            this.props.addCallback(val);
                                            this.updateState({
                                                results: this.state.results.filter(
                                                    (result: Contact) =>
                                                        result.name !== val.name
                                                )
                                            });
                                        }}
                                    >
                                        Add
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }
}

export function multiContactEditor(options: any): Editor {
    return {
        edit: (value: any, onChange: Function) => {
            value = value || [];
            const add = item => {
                value = value.slice(0);
                value.push(item);
                onChange(value);
            };
            const remove = item => {
                value = value.filter(i => i !== item);
                onChange(value);
            };
            return (
                <div>
                    <div
                        style={{
                            display: "table"
                        }}
                    >
                        {value.map(val => {
                            return (
                                <div
                                    style={{
                                        border: "1px solid grey",
                                        borderRadius: ".5em",
                                        padding: ".5em"
                                    }}
                                >
                                    {val.name} ({val.role}, {val.organisation}){" "}
                                    <button onClick={() => remove(val)}>
                                        &#x2715;
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <br />
                    <div>
                        <ContactsSearch existing={value} addCallback={add} />
                    </div>
                </div>
            );
        },
        view: (value: any) => {
            value = value || [];
            return (
                <React.Fragment>
                    <ul>
                        {value.map(val => {
                            return (
                                <li>
                                    {val.name || "No Name"} (
                                    {val.role || "Unspecified Role"},{" "}
                                    {val.organisation || "Unknown Organisation"}
                                    )
                                </li>
                            );
                        })}
                    </ul>
                </React.Fragment>
            );
        }
    };
}
