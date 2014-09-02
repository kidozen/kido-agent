#! /bin/sh
DIR=current-dir	
NPM_PREFIX=/usr
NODE_PATH=/usr/bin
PID=/var/run/kido-agent.pid
case "$1" in
      start)
                echo "starting kido-agent"
                start-stop-daemon --start --name kido-agent --chdir $DIR --startas $NODE_PATH/node bin/process > output.txt 2> err.txt &
                echo $! > $PID
            ;;
      stop)
                echo "stopping kido-agent"
                start-stop-daemon --stop --quiet --pidfile $PID

            ;;
esac
exit 0