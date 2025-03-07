// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
// with the License. A copy of the License is located at
//
// http://aws.amazon.com/apache2.0/
//
// or in the "LICENSE.txt" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
// OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and
// limitations under the License.
import React from 'react';
import { useNavigate } from "react-router-dom"

import jsyaml from 'js-yaml';

import { clearState, getState, setState, useState, updateState } from '../../store'
import { LoadAwsConfig } from '../../model'

// UI Elements
import {
  Box,
  BreadcrumbGroup,
  Button,
  SideNavigation,
  SpaceBetween,
} from "@awsui/components-react";

// SubPages
import { Source, sourceValidate } from './Source';
import { Cluster, clusterValidate } from './Cluster';
import { HeadNode, headNodeValidate } from './HeadNode';
import { MultiUser, multiUserValidate } from './MultiUser';
import { Storage, storageValidate } from './Storage';
import { Queues, queuesValidate } from './Queues'
import { Create, createValidate, handleCreate as wizardHandleCreate, handleDryRun as wizardHandleDryRun } from './Create'

// Components
import { stopComputeFleet } from '../Clusters/StopDialog'
import Loading from '../../components/Loading'

// Icons
import CancelIcon from '@mui/icons-material/Cancel';

function wizardShow(navigate) {
  const editing = getState(['app', 'wizard', 'editing']);
  const page = getState(['app', 'wizard', 'page']);
  if(editing) {
    clearState(['app', 'wizard', 'config']);
    clearState(['app', 'wizard', 'clusterConfigYaml']);
    clearState(['app', 'wizard', 'loaded']);
    setState(['app', 'wizard', 'editing'], false);
    setState(['app', 'wizard', 'page'], 'source');
  }
  console.log("page: ", page);
  if(!page)
    setState(['app', 'wizard', 'page'], 'source');
  navigate('/configure');
}

function setPage(page) {
  const config = getState(['app', 'wizard', 'config']);
  if(page === "create")
  {
    console.log(jsyaml.dump(config));
    setState(['app', 'wizard', 'clusterConfigYaml'], jsyaml.dump(config));
  }
  setState(['app', 'wizard', 'page'], page);
}

function SideNav() {
  const editing = useState(['app', 'wizard', 'editing']);
  const page = getState(['app', 'wizard', 'page']) || 'source';
  const validated = getState(['app', 'wizard', 'validated']) || new Set();
  const currentPage = getState(['app', 'wizard', 'page']) || 'source';

  const baseList = [
    { type: "link", text: "Source", href: "source" },
    { type: "link", text: "Cluster", href: "cluster" },
    { type: "link", text: "Multi User", href: "multiUser" },
    { type: "link", text: "Head Node", href: "headNode" },
    { type: "link", text: "Storage", href: "storage" },
    { type: "link", text: "Queues", href: "queues" },
    { type: "link", text: (editing ? "Update" : "Create"), href: "create" },
  ]

  const items = baseList.map((i) => editing ? (i.href === 'source' ? {...i, text: <div onClick={(e) => {e.stopPropagation(); e.preventDefault();}} className='disabled'>{i.text}</div>} : i) : ((validated.has(i.href) || currentPage === i.href) ? i : {...i, text: <div onClick={(e) => {e.stopPropagation(); e.preventDefault();}} className='disabled'>{i.text}</div>}))

  return <div className="config-side-navigation">
    <SideNavigation
      activeHref={page}
      header={{ text: "Section" }}
      onFollow={event => {
        if (!event.detail.external) {
          event.preventDefault();
          setPage(event.detail.href);
        }
      }}
      items={items}/>
  </div>
}

function Configure() {
  const open = useState(['app', 'wizard', 'dialog']);
  const loadingPath = ['app', 'wizard', 'source', 'loading'];
  const loading = useState(loadingPath);
  const page = useState(['app', 'wizard', 'page']) || 'source';
  const clusterName = useState(['app', 'wizard', 'clusterName']);
  const [ refreshing, setRefreshing ] = React.useState(false);
  const aws = useState(['aws']);
  let multiUserEnabled = useState(['app', 'wizard', 'multiUser']);
  let navigate = useNavigate();

  const clusterPath = ['clusters', 'index', clusterName];
  const fleetStatus = useState([...clusterPath, 'computeFleetStatus']);

  const editing = useState(['app', 'wizard', 'editing']);

  const pages = ['source', 'cluster', 'headNode', 'storage', 'queues', 'create'];

  const handleClose = (clear) => {
    if(clear)
    {
      clearState(['app', 'wizard', 'config']);
      clearState(['app', 'wizard', 'clusterConfigYaml']);
      clearState(['app', 'wizard', 'clusterName']);
      clearState(['app', 'wizard', 'loaded']);
      clearState(['app', 'wizard', 'page']);
      clearState(['app', 'wizard', 'vpc']);
      clearState(['app', 'wizard', 'multiUser']);
      clearState(['app', 'wizard', 'validated']);
      clearState(loadingPath);
    }
    clearState(['app', 'wizard', 'errors']);
    navigate('/clusters');
  };

  const validators = {
    source: sourceValidate,
    cluster: clusterValidate,
    headNode: headNodeValidate,
    multiUser: multiUserValidate,
    storage: storageValidate,
    queues: queuesValidate,
    create: createValidate,
  }

  const handleNext = () => {
    let currentPage = getState(['app', 'wizard', 'page']) || 'source';

    // Run the validators corresponding to the page we are on
    if(validators[currentPage] && !validators[currentPage]())
      return;

    // Add the current page to the validated set
    updateState(['app', 'wizard', 'validated'], (existing) => (existing || new Set()).add(currentPage))

    if(currentPage === "create")
    {
      wizardHandleCreate(() => handleClose(true), navigate);
      return;
    }

    if(currentPage === 'cluster' && multiUserEnabled)
    {
      setState(['app', 'wizard', 'page'], 'multiUser');
      return;
    }

    if(currentPage === 'multiUser') {
      setState(['app', 'wizard', 'page'], 'headNode');
      return;
    }

    for(let i = 0; i < pages.length; i++)
    {
      if(pages[i] === currentPage) {
        let nextPage = pages[i + 1];
        setPage(nextPage);
        return;
      }
    }
  }

  const handlePrev = () => {
    setState(['app', 'wizard', 'errors'], null);
    let currentPage = getState(['app', 'wizard', 'page']);
    let source = getState(['app', 'wizard', 'source', 'type']);

    // Special case where the user uploaded a file, hitting "back"
    // goes back to the upload screen rather than through the wizard
    if(currentPage === 'create' && source === 'upload')
    {
      setState(['app', 'wizard', 'page'], 'source');
      return;
    }

    if(currentPage === 'multiUser')
    {
      setState(['app', 'wizard', 'page'], 'cluster');
      return;
    }

    if(currentPage === 'headNode' && multiUserEnabled)
    {
      setState(['app', 'wizard', 'page'], 'multiUser');
      return;
    }

    for(let i = 1; i < pages.length; i++)
      if(pages[i] === currentPage)
      {
        let prevPage = pages[i - 1];
        setState(['app', 'wizard', 'page'], prevPage);
        return;
      }
  }

  const handleDryRun = () => {
    wizardHandleDryRun();
  }

  const handleRefresh = () => {
    setRefreshing(true);
    let region = getState(['wizard', 'region']);
    let chosenRegion = region === "Default" ? null : region;
    LoadAwsConfig(chosenRegion, () => setRefreshing(false));
  }

  const descriptionElementRef = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      const { current: descriptionElement } = descriptionElementRef;
      if (descriptionElement !== null) {
        descriptionElement.focus();
      }
    }
  }, [open]);

  React.useEffect(() => {
    const close = (e) => {
      if(e.key === 'Escape') {
        handleClose(true)
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  },[])

  return <div style={{minWidth: '1200px'}}>
    <SpaceBetween direction="vertical" size="l">
      <BreadcrumbGroup items={[{text: "Clusters", href: "#clusters"}, {text: (editing ? "Update" : "Create") }]}
        onClick={() => handleClose(true)}
      />
      <SpaceBetween direction="horizontal" size="s">
        <SideNav />
        <div style={{minWidth: '800px', maxWidth: '1000px'}}>
          <SpaceBetween direction="vertical" size='s'>
            <Box className="wizard-container">
              {{"source": <Source />,
                "cluster": aws ? <Cluster /> : <Loading />,
                "headNode": aws ? <HeadNode /> : <Loading />,
                "multiUser": aws ? <MultiUser /> : <Loading />,
                "storage": aws ? <Storage /> : <Loading />,
                "queues": aws ? <Queues /> : <Loading />,
                "create": aws ? <Create /> : <Loading />,
              }[page]}
            </Box>
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                {page !== "source" && page !== "create" &&
                <Button loading={refreshing} onClick={handleRefresh} iconName={"refresh"}>
                  Refresh AWS Config
                </Button>
                }
                {editing && (fleetStatus === "RUNNING" || fleetStatus === "STOP_REQUESTED") && <Button className="action" variant="normal" loading={fleetStatus === "STOP_REQUESTED"} onClick={stopComputeFleet}>
                  {fleetStatus !== "RUNNING" ? <span>Stop Compute Fleet</span>
                  : <div className="container"><CancelIcon /> Stop Compute Fleet</div>}
                </Button>}
                <Button onClick={() => handleClose(true)} autoFocus>Cancel</Button>
                <Button disabled={page === pages[0]} onClick={handlePrev}>Back</Button>
                {page === "create" && <Button onClick={handleDryRun}>Dry Run</Button>}
                <Button disabled={loading} onClick={handleNext}>{page === "create" ? (editing ? "Update" : "Create") : "Next"}</Button>
              </SpaceBetween>
            </Box>
          </SpaceBetween>
        </div>
      </SpaceBetween>
    </SpaceBetween>
  </div>
}

export { Configure as default, wizardShow }
