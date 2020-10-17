#!/bin/bash

.bin/build.sh

deno fmt --check

if [[ "$?" != "0" ]]
then
    exit -1
fi

deno test --inspect-brk -A --allow-read --allow-write --allow-run
