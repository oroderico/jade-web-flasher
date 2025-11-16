'use client'

import { useState, useEffect, useRef } from 'react'
import { ComputerIcon, Download, Usb, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { ESPLoader, Transport } from 'esptool-js'
import { useTranslation } from 'react-i18next'
import Header from './Header'
import InstructionPanel from './InstructionPanel'
import Selector from './Selector'
import device_data from './firmware_data.json'

import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type FirmwareFileDescriptor = {
  label?: string;
  path: string;
  address: string | number;
};

type FirmwareOption = {
  version: string;
  path: string;
  files?: FirmwareFileDescriptor[];
  baudRate?: number;
};

type BoardOption = {
  name: string;
  supported_firmware: FirmwareOption[];
  baudRate?: number;
};

type DeviceOption = {
  name: string;
  boards: BoardOption[];
};

const bufferToBinaryString = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return binary;
};

const parseAddress = (address: string | number) =>
  typeof address === 'number' ? address : parseInt(address, 16);

const getFileLabel = (file: FirmwareFileDescriptor, index: number) =>
  file.label ?? file.path.split('/').pop() ?? `Part ${index + 1}`;

export default function LandingHero() {
  const { t } = useTranslation();
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [selectedBoardVersion, setSelectedBoardVersion] = useState('')
  const [selectedFirmware, setSelectedFirmware] = useState('')
  const [status, setStatus] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isChromiumBased, setIsChromiumBased] = useState(true)
  const serialPortRef = useRef<any>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const textDecoderRef = useRef<TextDecoderStream | null>(null)
  const readableStreamClosedRef = useRef<Promise<void> | null>(null)
  const logsRef = useRef<string>('')
  const [keepConfig, setKeepConfig] = useState(false);
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});

  const devices: DeviceOption[] = (device_data as { devices: DeviceOption[] }).devices;

  const device = selectedDevice !== ''
    ? devices.find(d => d.name === selectedDevice)
    : undefined;
  const board = selectedBoardVersion !== ''
    ? device?.boards.find(b => b.name === selectedBoardVersion)
    : undefined;
  const firmware = selectedFirmware !== ''
    ? board?.supported_firmware.find(f => f.version == selectedFirmware)
    : undefined;
  const hasMultiFileFirmware = Boolean(firmware?.files?.length);

  useEffect(() => {
    setFileProgress({});
  }, [selectedDevice, selectedBoardVersion, selectedFirmware]);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChromium = /chrome|chromium|crios|edge/i.test(userAgent);
    setIsChromiumBased(isChromium);
  }, []);

  useEffect(() => {
    if (terminalContainerRef.current && !terminalRef.current && isLogging) {
      const term = new Terminal({
        cols: 80,
        rows: 24,
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6'
        }
      });
      terminalRef.current = term;
      term.open(terminalContainerRef.current);
      term.writeln(t('status.loggingStarted'));
      logsRef.current = t('status.loggingStarted') + '\n';
    }

    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [isLogging, t]);

  const handleConnect = async () => {
    setIsConnecting(true)
    setStatus(t('status.connecting'))

    try {
      const port = await navigator.serial.requestPort()
      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      })

      serialPortRef.current = port
      setIsConnected(true)
      setStatus(t('status.connected'))
    } catch (error) {
      console.error('Connection failed:', error)
      setStatus(`${t('status.connectionFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (isLogging) {
      await stopSerialLogging();
    }
    try {
      if (serialPortRef.current?.readable) {
        await serialPortRef.current.close();
      }
      serialPortRef.current = null;
      setIsConnected(false)
      setStatus("")
    } catch (error) {
      console.error('Disconnect error:', error);
      setStatus(`${t('status.disconnectError')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const handleKeepConfigToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setKeepConfig(event.target.checked);
  };

  const startSerialLogging = async () => {
    if (!serialPortRef.current) {
      setStatus(t('status.connectFirst'));
      return;
    }

    try {
      setIsLogging(true);
      const port = serialPortRef.current;

      // First ensure any existing connections are cleaned up
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current;
      }

      // Set up text decoder stream
      const decoder = new TextDecoderStream();
      const inputDone = port.readable.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();

      textDecoderRef.current = decoder;
      readableStreamClosedRef.current = inputDone;
      readerRef.current = reader;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            break;
          }
          terminalRef.current?.write(value);
          logsRef.current += value;
        }
      } catch (error) {
        console.error('Error in read loop:', error);
      }
    } catch (error) {
      console.error('Serial logging error:', error);
      setStatus(`${t('status.loggingError')}: ${error instanceof Error ? error.message : String(error)}`);
    }
    setIsLogging(false);
  };

  const stopSerialLogging = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current;
        readableStreamClosedRef.current = null;
      }
      if (textDecoderRef.current) {
        textDecoderRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping serial logging:', error);
    } finally {
      setIsLogging(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logsRef.current], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `jade-diy-logs-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleStartFlashing = async () => {
    if (!serialPortRef.current) {
      setStatus(t('status.connectFirst'))
      return
    }

    if (!selectedDevice || !selectedBoardVersion) {
      setStatus(t('status.selectBoth'))
      return
    }
    
    if (!selectedFirmware) {
      setStatus(t('status.selectBoth'))
      return
    }

    setIsFlashing(true)
    setStatus(t('status.preparing'))

    try {
      // Stop logging if it's active
      if (isLogging) {
        await stopSerialLogging();
      }

      // Close the current connection
      if (serialPortRef.current.readable) {
        await serialPortRef.current.close();
      }

      if (!firmware) {
        throw new Error('No firmware available for the selected device and board version')
      }

      // Create transport and ESPLoader for flashing
      const transport = new Transport(serialPortRef.current);
      const loader = new ESPLoader({
        transport,
        baudrate: firmware.baudRate ?? board?.baudRate ?? 115200,
        romBaudrate: 115200,
        terminal: {
          clean() { },
          writeLine() { },
          write() { },
        },
      });

      await loader.main();

      const firmwareFiles = firmware.files ?? [];
      const isMultiPartFirmware = firmwareFiles.length > 0;
      const fileLabels: string[] = [];
      let fileArray: { data: string; address: number }[] = [];

      if (isMultiPartFirmware) {
        const initialProgress: Record<string, number> = {};
        for (const [index, fileDescriptor] of firmwareFiles.entries()) {
          const label = getFileLabel(fileDescriptor, index);
          fileLabels.push(label);
          initialProgress[label] = 0;
          const response = await fetch(fileDescriptor.path);
          if (!response.ok) {
            throw new Error(`Failed to load ${fileDescriptor.path}`);
          }
          const binaryString = bufferToBinaryString(await response.arrayBuffer());
          fileArray.push({
            data: binaryString,
            address: parseAddress(fileDescriptor.address),
          });
        }
        setFileProgress(initialProgress);
      } else {
        const firmwareResponse = await fetch(firmware.path);
        if (!firmwareResponse.ok) {
          throw new Error('Failed to load firmware file');
        }

        const firmwareBinaryString = bufferToBinaryString(await firmwareResponse.arrayBuffer());

        // On all Jade-Diy derivatives the same
        const nvsStart = 0x9000;
        const nvsSize = 0x6000;

        if (keepConfig) {
          fileArray = [
            {
              data: firmwareBinaryString.slice(0, nvsStart),
              address: 0,
            },
            {
              data: firmwareBinaryString.slice(nvsStart + nvsSize),
              address: nvsStart + nvsSize,
            },
          ];
        } else {
          fileArray = [
            {
              data: firmwareBinaryString,
              address: 0,
            },
          ];
        }
        const label = 'Firmware Image';
        fileLabels.push(label);
        setFileProgress({ [label]: 0 });
      }

      setStatus(t('status.flashing', { percent: 0 }))

      await loader.writeFlash({
        fileArray,
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = Math.round((written / total) * 100)
          const label = fileLabels[fileIndex] ?? t('hero.startFlashing')
          setFileProgress(prev => ({
            ...prev,
            [label]: percent,
          }))
          if (percent === 100 && fileIndex === fileLabels.length - 1) {
            setStatus(t('status.completed'))
          } else {
            setStatus(`${label}: ${t('status.flashing', { percent })}`)
          }
        },
        calculateMD5Hash: () => '',
      })

      setStatus(t('status.completed'))
      setFileProgress(prev => {
        const updated: Record<string, number> = {}
        Object.keys(prev).forEach((label) => {
          updated[label] = 100
        })
        return Object.keys(updated).length ? updated : prev
      })
      await loader.hardReset()

      setStatus(t('status.success'))
    } catch (error) {
      console.error('Flashing failed:', error)
      setStatus(`${t('status.flashingFailed')}: ${error instanceof Error ? error.message : String(error)}. Please try again.`)
    } finally {
      setIsFlashing(false)
    }
  }

  if (!isChromiumBased) {
    return (
      <div className="container px-4 md:px-6 py-12 text-center">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none mb-4">
          {t('errors.browserCompatibility.title')}
        </h1>
        <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
          {t('errors.browserCompatibility.description')}
        </p>
      </div>
    )
  }

  return (
    <>
      <Header onOpenPanel={() => setIsPanelOpen(true)} />
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                {t('hero.title')}
              </h1>
              <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                {t('hero.description')}
              </p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Button
                className="w-full"
                onClick={isConnected ? handleDisconnect : handleConnect}
                disabled={isConnecting || isFlashing}
              >
                {isConnected ? t('hero.disconnect') : t('hero.connect')}
                <Usb className="ml-2 h-4 w-4" />
              </Button>
              <Selector
                placeholder={t('hero.selectDevice')}
                values={devices.map(d => d.name)}
                onValueChange={(value) => {
                  setSelectedDevice(value)
                  setSelectedBoardVersion('')
                  setSelectedFirmware('')
                }}
                disabled={isConnecting || isFlashing || !isConnected}
              />
              {selectedDevice && (
                <Selector
                  placeholder={t('hero.selectBoard')}
                  values={device?.boards.map(b => b.name) ?? []}
                  onValueChange={(value) => {
                    setSelectedBoardVersion(value)
                    setSelectedFirmware('')
                  }}
                  disabled={isConnecting || isFlashing}
                />
              )}
              {selectedBoardVersion && (
                <Selector
                  placeholder={t('hero.selectFirmware')}
                  values={board?.supported_firmware.map(f => f.version) ?? []}
                  onValueChange={setSelectedFirmware}
                  disabled={isConnecting || isFlashing}
                />
              )}
              {!hasMultiFileFirmware && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="keepConfig"
                    className="cursor-pointer"
                    checked={keepConfig}
                    onChange={handleKeepConfigToggle}
                  />
                  <label htmlFor="keepConfig" className="text-gray-500 dark:text-gray-400 cursor-pointer">
                    {t('hero.keepConfig')}
                  </label>
                </div>
              )}
              <Button
                className="w-full"
                onClick={handleStartFlashing}
                disabled={!selectedDevice || !selectedBoardVersion || !selectedFirmware || isConnecting || isFlashing || !isConnected}
              >
                {isFlashing ? t('hero.flashing') : t('hero.startFlashing')}
                <Zap className="ml-2 h-4 w-4" />
              </Button>
              {Object.keys(fileProgress).length > 0 && (
                <div className="w-full space-y-2 pt-2">
                  {Object.entries(fileProgress).map(([label, value]) => (
                    <div key={label} className="text-left">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>{label}</span>
                        <span>{Math.round(value)}%</span>
                      </div>
                      <div className="h-2 rounded bg-gray-200 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-[width] duration-150"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={isLogging ? stopSerialLogging : startSerialLogging}
                  disabled={!isConnected || isFlashing}
                >
                  {isLogging ? t('hero.stopLogging') : t('hero.startLogging')}
                  <ComputerIcon className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  className="flex-1"
                  onClick={downloadLogs}
                  disabled={!logsRef.current}
                >
                  {t('hero.downloadLogs')}
                  <Download className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="mx-auto max-w-[400px] text-gray-500 md:text-m dark:text-gray-400">
                {t('hero.loggingDescription')}
              </p>
              <p className="mx-auto mt-2 max-w-[400px] text-xs text-gray-400 dark:text-gray-500">
                {t('hero.loggingDisclaimer')}
              </p>
              {status && <p className="mt-2 text-sm font-medium">{status}</p>}
            </div>
            {isLogging && (
              <div
                ref={terminalContainerRef}
                className="w-full max-w-4xl h-[400px] bg-black rounded-lg overflow-hidden mt-8 border border-gray-700 text-left"
              />
            )}
          </div>
        </div>
      </section>
      <InstructionPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  )
}
