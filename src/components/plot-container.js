// Copyright (c) 2020 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// libraries
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import {StaticMap} from 'react-map-gl';
import debounce from 'lodash.debounce';
import {exportImageError} from 'utils/notifications-utils';
import MapContainerFactory from './map-container';
import {convertToPng} from 'utils/export-utils';
import {scaleMapStyleByResolution} from 'utils/map-style-utils/mapbox-gl-style-editor';
import {getScaleFromImageSize} from 'utils/export-utils';

const DEBOUNCE_DELAY_MS = 500;
const OUT_OF_SCREEN_POSITION = -9999;

const ELEMENT_FILTER_FUNC = node => node.className !== 'mapboxgl-control-container';

const propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  exportImageSetting: PropTypes.object.isRequired,
  addNotification: PropTypes.func.isRequired,
  mapFields: PropTypes.object.isRequired,
  setExportingImage: PropTypes.func.isRequired
};

PlotContainerFactory.deps = [MapContainerFactory];

// Remove mapbox logo in exported map, because it contains non-ascii characters
const StyledPlotContainer = styled.div`
  .mapboxgl-ctrl-bottom-left,
  .mapboxgl-ctrl-bottom-right {
    display: none;
  }

  top: ${props => props.positionY}px;
  left: ${props => props.positionX}px;

  position: absolute;
`;

const StyledMapContainer = styled.div`
  width: ${({size = {}}) => size.width}px;
  height: ${({size = {}}) => size.height}px;
  display: flex;
`;

const deckGlProps = {
  glOptions: {
    preserveDrawingBuffer: true,
    useDevicePixels: false
  }
};

export default function PlotContainerFactory(MapContainer) {
  const PlotContainer = React.memo(
    ({
      exportImageSetting,
      mapFields,
      splitMaps,
      setExportingImage,
      setExportImageDataUri,
      setExportImageError,
      addNotification
    }) => {
      const {imageSize = {}, legend, ratio, resolution} = exportImageSetting;
      const {mapState, mapStyle} = mapFields;
      const isSplit = useMemo(() => splitMaps && splitMaps.length > 1, [splitMaps]);

      const size = useMemo(
        () => ({
          width: imageSize.imageW || 1,
          height: imageSize.imageH || 1
        }),
        [imageSize.imageW, imageSize.imageH]
      );

      const scale = useMemo(() => {
        if (imageSize.scale) {
          return imageSize.scale;
        }

        const tmpScale = getScaleFromImageSize(
          imageSize.imageW,
          imageSize.imageH,
          mapState.width * (mapState.isSplit ? 2 : 1),
          mapState.height
        );

        return tmpScale > 0 ? tmpScale : 1;
      }, [imageSize, mapState]);

      const plottingAreaRef = useRef();

      const retrieveNewScreenShot = useCallback(() => {
        if (plottingAreaRef.current) {
          setExportingImage();
          convertToPng(plottingAreaRef.current, {filter: ELEMENT_FILTER_FUNC})
            .then(setExportImageDataUri)
            .catch(err => {
              setExportImageError(err);
              addNotification(exportImageError({err}));
            });
        }
      }, [setExportingImage, plottingAreaRef.current]);

      const onMapRender = debounce(
        useCallback(
          map => {
            if (map.isStyledLoaded()) {
              retrieveNewScreenShot();
            }
          },
          [retrieveNewScreenShot]
        ),
        DEBOUNCE_DELAY_MS
      );

      const mapProps = useMemo(
        () => ({
          ...mapFields,
          mapStyle: {
            ...mapStyle,
            bottomMapStyle: scaleMapStyleByResolution(mapStyle.bottomMapStyle, scale),
            topMapStyle: scaleMapStyleByResolution(mapStyle.topMapStyle, scale)
          },

          // override viewport based on export settings
          mapState: {
            ...mapState,
            width: size.width / (isSplit ? 2 : 1),
            height: size.height,
            zoom: mapState.zoom + (Math.log2(scale) || 0)
          },
          mapControls: {
            // override map legend visibility
            mapLegend: {
              show: legend,
              active: true
            }
          },
          MapComponent: StaticMap,
          onMapRender,
          isExport: true,
          deckGlProps
        }),
        [mapFields, scale, size, isSplit, mapState, mapStyle, mapStyle.bottomMapStyle, mapStyle.topMapStyle, onMapRender]
      );

      const mapContainers = useMemo(() => {
        return !isSplit ? (
          <MapContainer index={0} {...mapProps} />
        ) : (
          splitMaps.map((settings, index) => (
            <MapContainer
              key={index}
              index={index}
              {...mapProps}
              mapLayers={splitMaps[index].layers}
            />
          ))
        );
      }, [mapProps, splitMaps, isSplit]);

      useEffect(() => {
        setExportingImage();
      }, []);

      useEffect(() => {
        retrieveNewScreenShot();
      }, [ratio, resolution, legend]);

      return (
        <StyledPlotContainer
          positionX={OUT_OF_SCREEN_POSITION}
          positionY={OUT_OF_SCREEN_POSITION}
          className="export-map-instance"
        >
          <StyledMapContainer ref={plottingAreaRef} size={size}>
            {mapContainers}
          </StyledMapContainer>
        </StyledPlotContainer>
      );
    }
  );

  PlotContainer.propsTypes = propTypes;
  return PlotContainer;
}
