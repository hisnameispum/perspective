/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

import { polyfill } from "mobile-drag-drop";

import { bindTemplate } from "./utils.js";
import State from "./computed_column/State.js";
import Computation from "./computed_column/Computation.js";

import template from "../html/computed_column.html";

import "../less/computed_column.less";

polyfill({});

/******************************************************************************
 *
 * Drag & Drop Utils
 *
 */

// Computations
const hour_of_day = function(val) {
  return new Date(val).getHours();
};

const day_of_week = function(val) {
  return ["1 Sunday", "2 Monday", "3 Tuesday", "4 Wednesday", "5 Thursday", "6 Friday", "7 Saturday"][new Date(val).getDay()];
};

const month_of_year = function(val) {
  return ["01 January", "02 February", "03 March", "04 April", "05 May", "06 June", "07 July", "08 August", "09 September", "10 October", "11 November", "12 December"][new Date(val).getMonth()];
};

const hour_bucket = function(val) {
  let date = new Date(val);
  date.setMinutes(0);
  date.setSeconds(0);
  return +date;
};

const day_bucket = function(val) {
  let date = new Date(val);
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  return +date;
};

const week_bucket = function(val) {
  let date = new Date(val);
  let day = date.getDay();
  let diff = date.getDate() - day + (day == 0 ? -6 : 1);
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setDate(diff);
  return +date;
};

const month_bucket = function(val) {
  let date = new Date(val);
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setDate(1);
  return +date;
};

export const COMPUTATIONS = {
  hour_of_day: new Computation("hour_of_day", "date", "integer", hour_of_day),
  day_of_week: new Computation("day_of_week", "date", "string", day_of_week),
  month_of_year: new Computation("month_of_year", "date", "string", month_of_year),
  hour_bucket: new Computation("hour_bucket", "date", "date", hour_bucket),
  day_bucket: new Computation("day_bucket", "date", "date", day_bucket),
  week_bucket: new Computation("week_bucket", "date", "date", week_bucket),
  month_bucket: new Computation("month_bucket", "date", "date", month_bucket),
  uppercase: new Computation("uppercase", "string", "string", x => x.toUpperCase()),
  lowercase: new Computation("lowercase", "string", "string", x => x.toLowerCase()),
  length: new Computation("length", "string", "integer", x => x.length),
  add: new Computation("add", "float", "float", (a, b) => a + b, 2),
  subtract: new Computation("subtract", "float", "float", (a, b) => a - b, 2),
  multiply: new Computation("multiply", "float", "float", (a, b) => a * b, 2),
  divide: new Computation("divide", "float", "float", (a, b) => a / b, 2),
  percent_a_of_b: new Computation("percent_a_of_b", "float", "float", (a, b) => (a / b) * 100, 2),
  concat_space: new Computation("concat_space", "string", "string", (a, b) => a + " " + b, 2),
  concat_comma: new Computation("concat_comma", "string", "string", (a, b) => a + ", " + b, 2)
};

// Eslint complains here because we don't do anything, but actually we globally
// register this class as a CustomElement
@bindTemplate(template) // eslint-disable-next-line no-unused-vars
class ComputedColumn extends HTMLElement {
  constructor() {
    super();

    this.state = new State();

    this.type_markers = {
      float: "123",
      integer: "123",
      string: "abc",
      boolean: "t/f",
      date: "mdy"
    };
  }

  get computations() {
    return COMPUTATIONS;
  }

  connectedCallback() {
    this._register_ids();
    this._register_computations();
    this._register_callbacks();
    this._update_computation(null);
    this._register_inputs();
  }

  _register_computations() {
    this._computation_selector.innerHTML = "";
    let iterate = true;
    for (let comp of Object.keys(COMPUTATIONS)) {
      this._computation_selector.innerHTML += `<option value="${comp}"${iterate ? ' selected="selected"' : ""}>${comp.replace(/_/g, " ")}</option>`;
      iterate = false;
    }
  }

  // Generate input column holders, reset input column state
  _register_inputs() {
    this._input_columns.innerHTML = "";
    const computation = this.state.computation;
    const input_type = computation.input_type;

    this.state.input_columns = [];
    this.state.swap_target = false;

    // todo: replace html-loader with handlebars-loader

    for (let i = 0; i < computation.num_params; i++) {
      this._input_columns.innerHTML += `<div class="psp-cc-computation__input-column" 
                      data-index="${i}" 
                      drop-target 
                      ondragenter="dragEnter(event)">
                      <span class="psp-label__requiredType ${input_type}"></span>
                      <span class="psp-label__placeholder">Param ${i + 1}</span>
                      <div class="psp-cc-computation__drop-target-hover"></div>
                </div>`;
    }

    for (let column of this._input_columns.children) {
      column.addEventListener("drop", this._drop_column.bind(this));
      column.addEventListener("dragstart", this._drag_column.bind(this));
      column.addEventListener("dragend", this._remove_column.bind(this));
      column.addEventListener("dragover", this._hover_column.bind(this));
      column.addEventListener("dragleave", this._pass_column.bind(this));
    }

    this._clear_column_name();
  }

  // Drag & Drop
  _parse_data_transfer(data) {
    const column_data = JSON.parse(data);
    if (!column_data) return;

    return {
      column_name: column_data[0],
      column_type: column_data[3]
    };
  }

  _drag_column(event) {
    // called when columns are dragged from inside the UI
    if (this.state.computation.num_params > 1) {
      // if there is a chance of a swap happening, cache the swap target
      this.state.swap_target = event.currentTarget;
    }
  }

  _hover_column(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const drop_target = event.currentTarget;
    const drop_target_hover = drop_target.querySelector(".psp-cc-computation__drop-target-hover");

    this._clear_error_messages();

    if (drop_target.className !== "dropping") {
      //event.currentTarget.classList.remove('dropped');
      drop_target.classList.add("dropping");
    }
    if (drop_target_hover && !drop_target_hover.hasAttribute("drop-target")) {
      drop_target_hover.setAttribute("drop-target", "true");
    }

    if (drop_target.children.length === 2) {
      // drop_target_hover is the blue box
      drop_target.parentNode.insertBefore(drop_target_hover, drop_target.nextSibling);
    }
  }

  _drop_column(event) {
    const target = event.currentTarget;
    event.preventDefault();

    target.classList.remove("dropping");

    const is_swap = this.state.swap_target !== undefined && target.innerHTML.indexOf("perspective-row") > -1;

    // column must match return type of computation
    const data = this._parse_data_transfer(event.dataTransfer.getData("text"));
    if (!data) return;

    if (is_swap) {
      const current_column = target.children[0];
      const current_column_name = current_column.getAttribute("name");
      const current_column_type = current_column.getAttribute("type");
      event.swapTarget = this.state.swap_target;

      // take the column at the drop target, and set it to the column being swapped
      this._set_input_column(event, current_column_name, current_column_type);

      // reset swap_target and currentTarget
      this.state.swap_target = false;
      delete event.swapTarget;
    }

    this._set_input_column(event, data.column_name, data.column_type);
  }

  deselect_column(name) {
    this.state.input_columns = this.state.input_columns.map(x => (x && x.name === name ? undefined : x));
    this._apply_state(this.state.input_columns, this.state.computation);
  }

  // Called when a column is dragged out of the computed column UI
  _remove_column(event) {
    event.currentTarget.classList.remove("dropping");
  }

  // Called when the column passes over and then leaves the drop target
  _pass_column(event) {
    const src = event.currentTarget;
    if (src !== null && src.nodeName !== "SPAN") {
      const drop_target_hover = src.querySelector(".psp-cc-computation__drop-target-hover");
      src.classList.remove("dropping");
      if (drop_target_hover) drop_target_hover.removeAttribute("drop-target");
    }
  }

  // When state changes are made manually, apply them to the UI
  _apply_state(columns, computation, name) {
    this._update_computation(null, computation.name);
    this.state["input_columns"] = columns;
    const inputs = this._input_columns.children;

    for (let i = 0; i < this.state["input_columns"].length; i++) {
      if (this.state["input_columns"][i] !== undefined) {
        this._set_input_column({ currentTarget: inputs[i] }, this.state["input_columns"][i].name, this.state["input_columns"][i].type);
      }
    }

    this._column_name_input.innerText = name || "";
    this._set_column_name();
    this.state["name_edited"] = name !== undefined;
  }

  // error handling
  _set_error_message(type, target) {
    target.innerText = this.state.errors[type];
  }

  _clear_error_messages() {
    this.state["errors"] = {
      input_column: undefined,
      save: undefined
    };
    this._input_column_error_message.innerText = "";
    this._save_error_message.innerText = "";
  }

  // column_name
  _set_column_name() {
    const input = this._column_name_input;
    this.state["column_name"] = input.innerText;
    this._clear_error_messages();
  }

  _auto_column_name() {
    if (this.state.name_edited) {
      return;
    }
    if (this.state.input_columns.length > 0) {
      let names = [];
      for (let column of this.state.input_columns) names.push(column.name);
      this._column_name_input.innerText = `${this.state.computation.name}(${names.join(", ")})`;
    } else {
      this._column_name_input.innerText = "";
    }
    this._set_column_name();
  }

  _clear_column_name() {
    const input = this._column_name_input;
    input.innerText = "";
    this.state["name_edited"] = false;
    this._set_column_name();
  }

  _set_input_column(event, name, type) {
    const computation = this.state.computation;
    const computation_type = computation.input_type;
    const inputs = this.state.input_columns;

    let target;
    if (event.swapTarget) {
      target = event.swapTarget;
    } else {
      target = event.currentTarget;
    }

    const index = Number.parseInt(target.getAttribute("data-index"));

    if ((computation_type !== "float" && type !== computation_type) || (computation_type === "float" && type !== "float" && type !== "integer")) {
      this._register_inputs();
      this.state.errors.input_column = `Input column type (${type}) must match computation input type (${computation_type}).`;
      this._set_error_message("input_column", this._input_column_error_message);
      target.classList.remove("dropped");
      return;
    }

    target.classList.add("dropped");

    const drop_target_hover = target.querySelector(".psp-cc-computation__drop-target-hover");
    if (drop_target_hover) drop_target_hover.removeAttribute("drop-target");

    target.innerHTML = "";

    const column = {
      name: name,
      type: type
    };

    inputs[index] = column;

    this.state["input_columns"] = inputs;
    if (inputs.filter(x => x).length === computation.num_params) {
      this._auto_column_name();
    }

    this.dispatchEvent(
      new CustomEvent("perspective-computed-column-update", {
        detail: {
          target,
          column
        }
      })
    );
  }

  // computation
  _update_computation(event, computation_name) {
    const select = this._computation_selector;

    if (!computation_name) {
      computation_name = select[select.selectedIndex].value;
    } else if (event === null || event === undefined) {
      select.value = computation_name;
    }

    const computation = Object.assign({}, COMPUTATIONS[computation_name]);

    if (computation === undefined) {
      throw "Undefined computation could not be set.";
    }

    const return_type = computation.return_type;

    this._computation_type.innerHTML = `<span class="${return_type}">${this.type_markers[return_type]}</span>`;

    this.state["computation"] = computation;

    this._clear_column_name();
    this._register_inputs();
    this._clear_error_messages();
  }

  // save
  _save_computed_column() {
    if (!this.state.is_valid()) {
      this.state.errors.save = "Missing parameters for computed column.";
      this._set_error_message("save", this._save_error_message);
      return;
    }

    const computed_column = this.state;

    const event = new CustomEvent("perspective-computed-column-save", {
      detail: {
        name: computed_column.column_name,
        inputs: computed_column.input_columns.map(x => x.name),
        func: computed_column.computation.name
      }
    });

    this.dispatchEvent(event);
  }

  // close
  _close_computed_column() {
    this.style.display = "none";
    this._side_panel_actions.style.display = "flex";

    this.classList.remove("edit");
    this._column_name_input.innerText = "";
    this._input_columns.innerHTML = "";

    for (let child of this._input_columns.children) child.classList.remove("dropped");

    this.state = new State();
    this._update_computation();
  }

  _register_ids() {
    this._side_panel_actions = document.querySelector("#side_panel__actions");
    this._close_button = this.querySelector("#psp-cc__close");
    this._column_name_input = this.querySelector("#psp-cc-name");
    this._computation_selector = this.querySelector("#psp-cc-computation__select");
    this._computation_type = this.querySelector("#psp-cc-computation__type");
    this._input_columns = this.querySelector("#psp-cc-computation-inputs");
    //this._delete_button = this.querySelector('#psp-cc-button-delete');
    this._save_button = this.querySelector("#psp-cc-button-save");
    this._input_column_error_message = this.querySelector("#psp-cc__error--input");
    this._save_error_message = this.querySelector("#psp-cc__error--save");
  }

  _register_callbacks() {
    this._close_button.addEventListener("click", this._close_computed_column.bind(this));
    this._computation_selector.addEventListener("change", this._update_computation.bind(this));
    this._column_name_input.addEventListener("keyup", event => {
      this.state["name_edited"] = this._column_name_input.innerText && this._column_name_input.innerText.length > 0;
      this._set_column_name(event);
    });
    //this._delete_button.addEventListener('click', this._delete_computed_column.bind(this));
    this._save_button.addEventListener("click", this._save_computed_column.bind(this));
  }
}
