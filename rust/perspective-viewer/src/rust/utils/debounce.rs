////////////////////////////////////////////////////////////////////////////////
//
// Copyright (c) 2018, the Perspective Authors.
//
// This file is part of the Perspective library, distributed under the terms
// of the Apache License 2.0.  The full license can be found in the LICENSE
// file.

use async_std::sync::Mutex;

use std::cell::Cell;
use std::future::Future;
use std::rc::Rc;
use wasm_bindgen::*;

#[derive(Default)]
pub struct DebounceMutexData {
    id: Cell<u64>,
    mutex: Mutex<u64>,
}

#[derive(Clone, Default)]
pub struct DebounceMutex(Rc<DebounceMutexData>);

impl DebounceMutex {
    pub async fn lock<T>(&self, f: impl Future<Output = T>) -> T {
        let mut last = self.0.mutex.lock().await;
        let next = self.0.id.get();
        let result = f.await;
        *last = next;
        result
    }

    pub async fn debounce(
        &self,
        f: impl Future<Output = Result<(), JsValue>>,
    ) -> Result<(), JsValue> {
        let next = self.0.id.get() + 1;
        let mut last = self.0.mutex.lock().await;
        if *last < next {
            let next = self.0.id.get() + 1;
            self.0.id.set(next);
            let result = f.await;
            if result.is_ok() {
                *last = next;
            }

            result
        } else {
            Ok(())
        }
    }
}
